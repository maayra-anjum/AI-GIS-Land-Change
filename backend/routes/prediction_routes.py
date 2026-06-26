from flask import Blueprint, request, jsonify
from flask_cors import CORS
from processing.patch_creator import create_patches, create_multiple_patches
from processing.post_processing import generate_stats, generate_color_map
from model.predict import predict_pil
from PIL import Image, ImageChops
import numpy as np
import os
import json
import shutil
import time
import traceback
import glob
from urllib.parse import urlparse

bp = Blueprint("prediction", __name__)
CORS(bp, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Resolve relative cache paths against the backend directory.
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_CACHE_DIR = os.path.join(BASE_DIR, "cache")
BACKEND_RESULTS_DIR = os.path.join(BACKEND_CACHE_DIR, "results")

def resolve_backend_path(path_value: str) -> str:
    if os.path.isabs(path_value):
        return path_value
    return os.path.abspath(os.path.join(BASE_DIR, path_value))

# Helper: clear folder
def clear_folder(folder_path):
    if os.path.exists(folder_path):
        shutil.rmtree(folder_path)
    os.makedirs(folder_path, exist_ok=True)


def clear_old_run_directories(current_run_id=None):
    if not os.path.exists(BACKEND_RESULTS_DIR):
        os.makedirs(BACKEND_RESULTS_DIR, exist_ok=True)
        return

    for entry in os.listdir(BACKEND_RESULTS_DIR):
        if current_run_id and entry == current_run_id:
            continue
        full_path = os.path.join(BACKEND_RESULTS_DIR, entry)
        if os.path.isdir(full_path):
            shutil.rmtree(full_path)


def strip_url_to_local_path(url):
    if not isinstance(url, str):
        return url
    parsed = urlparse(url)
    return parsed.path.lstrip("/")


def load_patches_from_directory(patches_dir):
    """
    Load patches from a directory created by create_patches().
    Reads the saved metadata JSON to restore lat/lng coordinates.
    Falls back to zero-coordinates if metadata is missing.
    """
    patches = []
    if not os.path.exists(patches_dir):
        return patches

    # Try to load saved metadata (includes lat/lng)
    meta_path = os.path.join(patches_dir, "patches_meta.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                patches = json.load(f)
            # Verify the patch files still exist; drop any that don't
            patches = [p for p in patches if os.path.exists(p["path"])]
            if patches:
                return patches
        except Exception as e:
            print(f"⚠️ Could not read patch metadata: {e}")

    # Fallback: scan directory (coordinates will be 0,0)
    patch_files = sorted(glob.glob(os.path.join(patches_dir, "patch_*.png")))
    for idx, patch_file in enumerate(patch_files):
        patches.append({
            "path": patch_file,
            "lat": 0,
            "lng": 0,
            "area": f"Patch_{idx}"
        })
    return patches

@bp.route("/predict", methods=["POST", "OPTIONS"])
def predict():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    try:
        data = request.get_json()
        start_image = data.get("start_image")
        end_image = data.get("end_image")
        bounds = data.get("bounds")  # [[minLat, minLng], [maxLat, maxLng]]
        image_bounds = data.get("image_bounds") or bounds  # prefer GEE-derived bounds
        patch_size = data.get("patch_size", 64)
        run_id = data.get("run_id")

        if not start_image or not end_image:
            return jsonify({"error": "Start or end image missing"}), 400

        if not (
            isinstance(bounds, (list, tuple))
            and len(bounds) == 2
            and isinstance(bounds[0], (list, tuple))
            and isinstance(bounds[1], (list, tuple))
            and len(bounds[0]) == 2
            and len(bounds[1]) == 2
        ):
            return jsonify({"error": "Bounds missing or invalid"}), 400

        # Convert URLs → local paths safely
        start_image_local = strip_url_to_local_path(start_image)
        end_image_local = strip_url_to_local_path(end_image)
        start_image_path = resolve_backend_path(start_image_local)
        end_image_path = resolve_backend_path(end_image_local)

        # Always generate fresh patches directly from images.
        # Bypassing pre-generated patches entirely — they may be stale.
        clear_folder(BACKEND_RESULTS_DIR)
        run_id = run_id or str(int(time.time() * 1000))

        start_patch_dir = os.path.join(BACKEND_RESULTS_DIR, run_id, "start_patches")
        end_patch_dir   = os.path.join(BACKEND_RESULTS_DIR, run_id, "end_patches")

        # Open both images, force same size before patching
        s_full = Image.open(start_image_path).convert("RGB")
        e_full = Image.open(end_image_path).convert("RGB")
        if s_full.size != e_full.size:
            print(f"⚠️ Resizing end image {e_full.size} → {s_full.size}")
            e_full = e_full.resize(s_full.size, Image.LANCZOS)
            e_full.save(end_image_path)   # overwrite so patches are consistent

        start_patches = create_patches(start_image_path, start_patch_dir, image_bounds=image_bounds, patch_size=patch_size)
        end_patches   = create_patches(end_image_path,   end_patch_dir,   image_bounds=image_bounds, patch_size=patch_size)
        print(f"✅ Fresh patches: {len(start_patches)} start, {len(end_patches)} end")

        # If GEE returns slightly different image sizes, the patch grids can differ.
        # Align by the shortest list so downstream processing stays consistent.
        if len(start_patches) != len(end_patches):
            min_len = min(len(start_patches), len(end_patches))
            start_patches = start_patches[:min_len]
            end_patches = end_patches[:min_len]

        if not end_patches:
            return jsonify({"error": "No patches created from end image"}), 500

        print(f"🔮 Running predictions on {len(start_patches)} patch pairs...")

        # 2️⃣ Predict each patch using the *difference* between start and end.
        end_preds = []
        for idx, (start_patch, end_patch) in enumerate(zip(start_patches, end_patches)):
            try:
                with Image.open(start_patch["path"]) as s_img, Image.open(end_patch["path"]) as e_img:
                    s_img = s_img.convert("RGB")
                    e_img = e_img.convert("RGB")

                    # Force same size — critical for accurate diff
                    if s_img.size != e_img.size:
                        e_img = e_img.resize(s_img.size, Image.LANCZOS)

                    diff_img = ImageChops.difference(s_img, e_img)

                pred_class = predict_pil(diff_img)
                end_preds.append(pred_class)

                if (idx + 1) % 10 == 0 or idx < 3:
                    arr = np.array(diff_img, dtype=np.float32)
                    print(f"   Patch {idx}: mean={arr.mean():.1f} std={arr.std():.1f} frac>30={(arr>30).mean():.2f} -> class={pred_class}")

            except Exception as e:
                print(f"⚠️ Error processing patch {idx}: {e}")
                end_preds.append(2)  # fallback to No Change, not -1

        print("📊 Generating statistics and visualizations...")

        # 3️⃣ Generate stats for frontend
        stats = generate_stats(end_preds)

        # 4️⃣ Generate color map for visualization
        end_img = Image.open(end_image_path)
        color_map_img = generate_color_map(end_preds, width=end_img.width, height=end_img.height, patch_size=patch_size)
        color_map_abs_path = os.path.join(BACKEND_RESULTS_DIR, run_id, "color_map.png")
        os.makedirs(os.path.dirname(color_map_abs_path), exist_ok=True)
        color_map_img.save(color_map_abs_path)

        # Return a URL-friendly relative path for the Flask route.
        # (Use forward slashes because this value goes into a browser URL.)
        color_map_rel_path = os.path.join("cache", "results", run_id, "color_map.png").replace("\\", "/")

        print("✅ Prediction complete!")
        print(f"📈 Results: {stats}")

        predictions_info = []
        for idx, patch in enumerate(end_patches):
            predictions_info.append({
                "patch": os.path.basename(patch["path"]),
                "class": end_preds[idx],
                "lat": patch.get("lat", 0),
                "lng": patch.get("lng", 0),
                "area": patch.get("area", f"Patch_{idx}")
            })

        return jsonify({
            "run_id": run_id,
            "patch_size": patch_size,
            "predictions": predictions_info,
            "stats": stats,
            "color_map": color_map_rel_path,
            "map_bounds": bounds
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500