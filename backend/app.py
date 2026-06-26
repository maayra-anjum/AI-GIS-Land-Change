from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import ee
import os
from gee.fetch_images import fetch_images
from routes.prediction_routes import bp as prediction_bp
from routes.chat_routes import bp as chat_bp

app = Flask(__name__)


def extract_geometry(polygon):
    if not isinstance(polygon, dict):
        return None

    if polygon.get("type") == "Feature" and isinstance(polygon.get("geometry"), dict):
        return extract_geometry(polygon["geometry"])

    if polygon.get("geometry") and isinstance(polygon.get("geometry"), dict):
        return extract_geometry(polygon["geometry"])

    if polygon.get("type") in ("Polygon", "MultiPolygon") and "coordinates" in polygon:
        return {
            "type": polygon["type"],
            "coordinates": polygon["coordinates"],
        }

    return None


# Pakistan bounding box — approximate [minLng, minLat, maxLng, maxLat]
PAKISTAN_BOUNDS = {
    "min_lat": 23.5, "max_lat": 37.5,
    "min_lng": 60.5, "max_lng": 77.5,
}

def is_within_pakistan(polygon_coords: list) -> bool:
    """
    Check if ALL coordinates of the polygon fall within Pakistan's bounding box.
    coords format: [[lng, lat], [lng, lat], ...]
    """
    try:
        for coord in polygon_coords:
            lng, lat = coord[0], coord[1]
            if not (PAKISTAN_BOUNDS["min_lat"] <= lat <= PAKISTAN_BOUNDS["max_lat"] and
                    PAKISTAN_BOUNDS["min_lng"] <= lng <= PAKISTAN_BOUNDS["max_lng"]):
                return False
        return True
    except Exception:
        return False


def get_all_coords(geometry: dict) -> list:
    """Extract all coordinate pairs from a GeoJSON geometry."""
    coords = []
    try:
        if geometry["type"] == "Polygon":
            for ring in geometry["coordinates"]:
                coords.extend(ring)
        elif geometry["type"] == "MultiPolygon":
            for polygon in geometry["coordinates"]:
                for ring in polygon:
                    coords.extend(ring)
    except Exception:
        pass
    return coords

# ===== ENABLE CORS =====
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}}, supports_credentials=True)

# ===== GEE INITIALIZATION =====
SERVICE_ACCOUNT = os.getenv("GEE_SERVICE_ACCOUNT", 'gee-backend@ai-gis-land-change.iam.gserviceaccount.com')
KEY_FILE = os.getenv("GEE_JSON_PATH", 'service-account.json')

try:
    ee.Initialize(ee.ServiceAccountCredentials(SERVICE_ACCOUNT, KEY_FILE))
    print("✅ GEE Initialized successfully")
except Exception as e:
    print("❌ Error initializing GEE:", e)

# ===== REGISTER PREDICTION BLUEPRINT =====
app.register_blueprint(prediction_bp, url_prefix="/prediction")

# ===== REGISTER CHAT BLUEPRINT =====
app.register_blueprint(chat_bp, url_prefix="/api")

# ===== FETCH IMAGE ROUTE =====
@app.route("/fetch-image", methods=["POST", "OPTIONS"])
def fetch_image():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    try:
        data = request.get_json(force=True)
        print("📥 Received data:", data)

        polygon = data.get("polygon")
        start_year = data.get("start_year")
        end_year = data.get("end_year")
        print("📌 Polygon:", polygon)
        print("📌 Start year:", start_year, "End year:", end_year)

        if not polygon or start_year is None or end_year is None:
            return jsonify({"error": "Polygon or year missing"}), 400

        geometry = extract_geometry(polygon)
        print("🗺️ Normalized geometry sent to fetch_images:", geometry)

        if not geometry:
            return jsonify({"error": "Invalid polygon format"}), 400

        # ── Pakistan-only restriction ─────────────────────────────────────
        all_coords = get_all_coords(geometry)
        if not all_coords or not is_within_pakistan(all_coords):
            return jsonify({
                "error": "This tool is designed exclusively for Pakistan. "
                         "Please draw your area of interest within Pakistan's boundaries."
            }), 400

        try:
            start_year = int(start_year)
            end_year = int(end_year)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid start or end year"}), 400

        urls = fetch_images(geometry, start_year, end_year)
        print("✅ Fetched URLs:", urls)

        if "error" in urls:
            return jsonify(urls), 400

        return jsonify(urls)

    except Exception as e:
        import traceback
        print("❌ /fetch-image error:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/gee/fetch-image", methods=["POST", "OPTIONS"])
def fetch_image_gee():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    return fetch_image()

# ===== SERVE CACHED IMAGES =====
@app.route('/cache/images/<year>/<filename>')
def serve_image(year, filename):
    folder_path = os.path.join(BASE_DIR, "cache", "images", str(year))
    if not os.path.exists(os.path.join(folder_path, filename)):
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(folder_path, filename)

# ===== SERVE CACHED RESULTS (e.g., color_map.png) =====
@app.route("/cache/results/<path:filename>")
def serve_result(filename):
    folder_path = os.path.join(BASE_DIR, "cache", "results")
    if not os.path.exists(os.path.join(folder_path, filename)):
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(folder_path, filename)

# ===== MODEL STATUS ROUTE =====
@app.route("/model-status", methods=["GET"])
def model_status():
    """Quick health check — tells you whether the real model or the random heuristic is active."""
    from model.predict import use_model, weights_path
    return jsonify({
        "model_loaded": bool(use_model),
        "weights_path": weights_path,
        "message": "Real model active" if use_model else "⚠️ Heuristic fallback active — results are random!"
    })

# ===== MAIN ENTRY =====
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)