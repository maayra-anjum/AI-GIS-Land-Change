import ee
import os
from ee.ee_exception import EEException
from dotenv import load_dotenv
from PIL import Image
import requests
from io import BytesIO
import time
import shutil  # 🔹 for deleting old images
import sys

# 🔹 Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from processing.patch_creator import create_multiple_patches

# 🔹 Setup proper base directory
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CACHE_DIR = os.path.join(BASE_DIR, "cache", "images")
RESULTS_DIR = os.path.join(BASE_DIR, "cache", "results")

# 🔹 Create directories if they don't exist
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# 🔹 Load environment variables
load_dotenv()
SERVICE_ACCOUNT = os.getenv("GEE_SERVICE_ACCOUNT")
KEY_FILE = os.getenv("GEE_JSON_PATH")

# 🔹 Initialize GEE
try:
    ee.Initialize(ee.ServiceAccountCredentials(SERVICE_ACCOUNT, KEY_FILE))
    print("✅ GEE Initialized securely")
except EEException as e:
    print("⚠️ GEE Initialization Error:", e)


def clear_directory(path):
    if os.path.exists(path):
        shutil.rmtree(path)
    os.makedirs(path, exist_ok=True)


def normalize_geojson(geojson):
    if not isinstance(geojson, dict):
        return None

    if geojson.get("type") == "Feature" and isinstance(geojson.get("geometry"), dict):
        return normalize_geojson(geojson["geometry"])

    if geojson.get("type") in ("Polygon", "MultiPolygon") and "coordinates" in geojson:
        return {
            "type": geojson["type"],
            "coordinates": geojson["coordinates"],
        }

    return None


# 🔹 Fetch Images Function
def fetch_images(aoi_geojson, start, end, use_worldcover=False):
    try:
        aoi_geojson = normalize_geojson(aoi_geojson)
        if not aoi_geojson:
            return {"error": "Invalid AOI format"}

        # Validate AOI
        if "type" not in aoi_geojson or "coordinates" not in aoi_geojson:
            return {"error": "Invalid AOI format"}

        geom_type = aoi_geojson["type"]
        coords = aoi_geojson["coordinates"]

        # AOI geometry
        if geom_type == "Polygon":
            geom = ee.Geometry.Polygon(coords).buffer(200)
        elif geom_type == "MultiPolygon":
            geom = ee.Geometry.MultiPolygon(coords).buffer(200)
        else:
            return {"error": "Unsupported geometry type"}

        # Image collection
        collection = ee.ImageCollection("COPERNICUS/S2_HARMONIZED") \
            .filterBounds(geom) \
            .filterDate(f"{start}-01-01", f"{end}-12-31") \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

        if collection.size().getInfo() == 0:
            return {"error": "No images found for this AOI and dates"}

        # Start / End images — each filtered to its own year
        start_collection = collection.filterDate(f"{start}-01-01", f"{start}-12-31")
        end_collection   = collection.filterDate(f"{end}-01-01",   f"{end}-12-31")

        start_count = start_collection.size().getInfo()
        end_count   = end_collection.size().getInfo()

        if start_count == 0:
            return {"error": f"No cloud-free images found for start year {start} in this area. Try a different area or year."}
        if end_count == 0:
            return {"error": f"No cloud-free images found for end year {end} in this area. Try a different area or year."}

        first = start_collection.median().clip(geom)
        last  = end_collection.median().clip(geom)

        if use_worldcover:
            first = ee.Image("ESA/WorldCover/v100/2020").clip(geom)
            last = ee.Image("ESA/WorldCover/v100/2020").clip(geom)

        vis_params = {"bands": ["B4","B3","B2"], "min":500, "max":3500, "gamma":1.1}

        # Fixed dimensions — BOTH images must be exactly the same size
        # This is critical: different sizes cause artificial pixel differences
        # 512x512 gives good detail while staying within GEE thumb limits
        thumb_params = {
            "region": geom,
            "dimensions": "512x512",
            "format": "png"
        }

        first_url = first.visualize(**vis_params).getThumbURL(thumb_params)
        last_url  = last.visualize(**vis_params).getThumbURL(thumb_params)

        # Clean up old result artifacts before creating a new session
        clear_directory(RESULTS_DIR)

        # Unique timestamp
        timestamp = str(int(time.time() * 1000))

        # 🔹 Directories
        start_dir = os.path.join(CACHE_DIR, str(start))
        end_dir = os.path.join(CACHE_DIR, str(end))

        # 🔹 Clear old images automatically
        for dir_path in [start_dir, end_dir]:
            if os.path.exists(dir_path):
                shutil.rmtree(dir_path)  # delete old files
            os.makedirs(dir_path, exist_ok=True)  # recreate folder

        # Paths for new images
        first_path = os.path.join(start_dir, f"image_{timestamp}.png")
        last_path = os.path.join(end_dir, f"image_{timestamp}.png")

        # Download start image
        response = requests.get(first_url)
        if response.status_code != 200:
            return {"error": f"Failed to download start image: {response.status_code}"}
        img = Image.open(BytesIO(response.content))
        img.save(first_path)

        # Download end image
        response = requests.get(last_url)
        if response.status_code != 200:
            return {"error": f"Failed to download end image: {response.status_code}"}
        img = Image.open(BytesIO(response.content))
        img.save(last_path)

        print(f"✅ Downloaded start image: {first_path}")
        print(f"✅ Downloaded end image: {last_path}")

        # Compute bounds from the GEE geometry for accurate patch geo-coordinates
        bounds_info = geom.bounds().getInfo()
        coords = bounds_info["coordinates"][0]
        lngs = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        image_bounds = [
            [min(lats), min(lngs)],  # [minLat, minLng]
            [max(lats), max(lngs)],  # [maxLat, maxLng]
        ]
        print(f"📐 Image bounds for patch geo-mapping: {image_bounds}")

        # Return URLs — patches will be generated fresh in prediction_routes
        return {
            "run_id": timestamp,
            "start_image": f"http://127.0.0.1:5000/cache/images/{start}/image_{timestamp}.png",
            "end_image": f"http://127.0.0.1:5000/cache/images/{end}/image_{timestamp}.png",
            "image_bounds": image_bounds,
        }

    except EEException as e:
        return {"error": f"GEE Exception: {str(e)}"}
    except Exception as e:
        return {"error": f"Unexpected Error: {str(e)}"}