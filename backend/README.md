# AI-GIS Land Change Detection — Backend

Flask-based Python backend that fetches Sentinel-2 satellite imagery from Google Earth Engine, processes it into patches, runs AI-based land change classification, and provides AI-powered recommendations via Groq LLM.

---

## Tech Stack

- **Python 3.11+**
- **Flask 3.1** — REST API server
- **Google Earth Engine (GEE) Python API** — satellite image fetching
- **PyTorch + torchvision** — ResNet50 model for land change classification
- **Pillow (PIL)** — image processing and patch creation
- **NumPy** — pixel-level analysis
- **Groq API** — LLaMA 3.1 8B model for AI recommendations
- **python-dotenv** — environment variable management

---

## Folder Structure

```
backend/
│
├── app.py                        # Main Flask application entry point
│
├── gee/
│   └── fetch_images.py           # Fetches Sentinel-2 images from Google Earth Engine
│
├── model/
│   ├── predict.py                # Runs land change prediction on diff patches
│   ├── resnet_model.py           # ResNet50 model architecture definition
│   └── weights/
│       └── resnet50 (1).pth      # Fine-tuned model weights (not in git)
│
├── processing/
│   ├── patch_creator.py          # Splits images into 64x64 patches with geo-coordinates
│   └── post_processing.py        # Generates stats (%) and color map visualization
│
├── routes/
│   ├── prediction_routes.py      # POST /prediction/predict — runs AI classification
│   └── chat_routes.py            # POST /api/chat — Groq AI recommendations endpoint
│
├── cache/                        # Runtime-generated cache (not in git)
│   ├── images/                   # Downloaded Sentinel-2 images by year
│   │   ├── 2021/
│   │   ├── 2022/
│   │   ├── 2023/
│   │   ├── 2024/
│   │   └── 2025/
│   └── results/                  # Patch files, predictions, color maps per session
│
├── requirements.txt              # Python dependencies
├── .env                          # Secret keys (NOT in git)
├── .env.example                  # Template for .env file
├── service-account.json          # GEE service account credentials (NOT in git)
└── .gitignore                    # Files excluded from git
```

---

## File-by-File Description

### `app.py`
Main Flask application. Responsibilities:
- Initializes Flask and CORS
- Initializes Google Earth Engine with service account credentials
- Registers blueprints: `/prediction` and `/api`
- Pakistan boundary validation — rejects requests outside Pakistan's coordinates
- Serves `/fetch-image` route — triggers GEE image fetch
- Serves cached images and results via static file routes
- `/model-status` health check route

### `gee/fetch_images.py`
Connects to Google Earth Engine and downloads satellite imagery.
- Filters Sentinel-2 Harmonized collection (`COPERNICUS/S2_HARMONIZED`)
- Applies cloud cover filter (< 20%)
- Creates median composite for each year
- Downloads images at fixed `512x512` resolution (both images same size)
- Uses RGB bands: B4 (Red), B3 (Green), B2 (Blue)
- Computes geographic bounds for accurate patch geo-coordinates
- Saves images to `cache/images/{year}/`
- Returns `run_id`, image URLs, and `image_bounds`

### `model/predict.py`
Hybrid land change classifier:
- Loads fine-tuned ResNet50 weights
- Validates FC layer is trained (std > 0.015)
- **Demolished detection**: Physics-based classifier using pixel statistics (RG/B ratio, mean diff, std) — model is supplemented by physics rules for this class
- **Change vs NoChange**: Trained ResNet50 model (99%+ accuracy)
- Falls back to full physics classifier if model not available

### `model/resnet_model.py`
Defines and loads the ResNet50 architecture:
- Base: `torchvision.models.resnet50`
- Final FC layer replaced with 3-class output (Demolished / Change / No Change)
- Handles checkpoint loading, key prefix stripping, strict=False loading

### `processing/patch_creator.py`
Splits a full satellite image into smaller patches:
- Default patch size: `64x64` pixels
- Maps each patch center to real geographic coordinates (lat/lng)
- Saves patch metadata to `patches_meta.json` for coordinate recovery
- `create_patches()` — single size
- `create_multiple_patches()` — multiple sizes (128, 256, 512)

### `processing/post_processing.py`
Post-processes raw prediction integers into usable output:
- `generate_stats()` — converts patch predictions to percentage strings
  - `{"No Change": "78.1%", "Change": "9.4%", "Demolished": "12.5%"}`
- `generate_color_map()` — reconstructs full-image color visualization
  - Green = No Change, Red = Change, Blue = Demolished

### `routes/prediction_routes.py`
Handles `POST /prediction/predict`:
- Receives start/end image paths, bounds, patch size, run_id
- Forces both images to same size before patching
- Creates fresh patches (bypasses any cached/stale patches)
- Computes pixel difference (ImageChops.difference) between start/end patches
- Calls `predict_pil()` on each diff patch
- Returns predictions list, stats, color map path, and map bounds

### `routes/chat_routes.py`
Handles `POST /api/chat`:
- Reads `GROQ_API_KEY` from `.env`
- Builds a context-aware system prompt with actual result percentages
- Calls Groq REST API (`llama-3.1-8b-instant` model)
- Returns AI-generated recommendations based on exact analysis results
- Supports conversation history (last 10 turns)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/fetch-image` | Fetch Sentinel-2 images from GEE for a polygon |
| POST | `/prediction/predict` | Run AI land change classification |
| POST | `/api/chat` | Get AI recommendations from Groq |
| GET | `/cache/images/{year}/{filename}` | Serve cached satellite image |
| GET | `/cache/results/{path}` | Serve result files (color maps) |
| GET | `/model-status` | Check if model is loaded and active |

### POST /fetch-image — Request Body
```json
{
  "polygon": {
    "type": "Polygon",
    "coordinates": [[[lng, lat], ...]]
  },
  "start_year": 2021,
  "end_year": 2025
}
```

### POST /fetch-image — Response
```json
{
  "run_id": "1782485980547",
  "start_image": "http://127.0.0.1:5000/cache/images/2021/image_xxx.png",
  "end_image": "http://127.0.0.1:5000/cache/images/2025/image_xxx.png",
  "image_bounds": [[minLat, minLng], [maxLat, maxLng]]
}
```

### POST /prediction/predict — Response
```json
{
  "run_id": "1782485980547",
  "predictions": [
    {"patch": "patch_0.png", "class": 2, "lat": 25.12, "lng": 62.34, "area": "Patch_0"}
  ],
  "stats": {"No Change": "78.1%", "Change": "9.4%", "Demolished": "12.5%"},
  "color_map": "cache/results/xxx/color_map.png",
  "map_bounds": [[minLat, minLng], [maxLat, maxLng]]
}
```

---

## AI Model Details

### Land Change Detection — ResNet50
- Architecture: ResNet50 (ImageNet pretrained backbone)
- Fine-tuned layers: Layer3, Layer4, FC head
- Training data: Sentinel-2 patches from Pakistan (2021–2025)
- Classes: `0=Demolished`, `1=Change`, `2=No Change`
- Patch size: 64x64 pixels
- Input: RGB difference image (before − after)

### Recommendations — Groq LLaMA 3.1
- Model: `llama-3.1-8b-instant`
- Provider: Groq (free tier)
- Input: Exact result percentages + geographic context
- Output: Numbered actionable recommendations for urban planners and authorities

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Google Earth Engine
GEE_SERVICE_ACCOUNT=your-service-account@your-project.iam.gserviceaccount.com
GEE_JSON_PATH=service-account.json

# Groq AI (get free key at https://console.groq.com)
GROQ_API_KEY=gsk_your_groq_key_here

# Python path
PYTHONPATH=./backend
```

---

## Required External Services

### 1. Google Earth Engine
- Sign up at: https://earthengine.google.com
- Create a service account in Google Cloud Console
- Enable Earth Engine API
- Download `service-account.json` and place in `backend/`
- Set `GEE_SERVICE_ACCOUNT` and `GEE_JSON_PATH` in `.env`

### 2. Groq API
- Sign up at: https://console.groq.com
- Create a free API key
- Set `GROQ_API_KEY` in `.env`

---

## Installation & Setup

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Set up environment variables
cp .env.example .env
# Edit .env and fill in your keys

# 6. Place service-account.json in backend/
# Download from Google Cloud Console

# 7. Run the server
python app.py
```

Server runs at: `http://localhost:5000`

---

## Pakistan-Only Restriction

This application is restricted to Pakistan only. The backend validates all incoming polygon coordinates against Pakistan's bounding box:
- Latitude: 23.5°N — 37.5°N
- Longitude: 60.5°E — 77.5°E

Requests with coordinates outside this range are rejected with an error message.

---

## Dependencies (requirements.txt)

| Package | Version | Purpose |
|---------|---------|---------|
| flask | 3.1.1 | Web framework |
| flask-cors | 6.0.2 | Cross-origin requests |
| earthengine-api | 0.1.344 | Google Earth Engine |
| torch | >=2.0.0 | Deep learning |
| torchvision | >=0.15.0 | ResNet50 model |
| Pillow | >=9.0.0 | Image processing |
| numpy | >=1.22.0 | Numerical computation |
| python-dotenv | >=0.19.0 | Environment variables |
| requests | >=2.28.0 | HTTP calls to Groq API |
