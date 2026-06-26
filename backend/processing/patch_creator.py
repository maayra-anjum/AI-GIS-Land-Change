import os
import json
from PIL import Image

PATCH_SIZE = 256
PATCH_SIZES = [128, 256, 512]  # Multiple patch sizes for multi-resolution analysis

def create_patches(image_path, save_dir, image_bounds=None, patch_size=PATCH_SIZE):
    """
    Divide image into PATCH_SIZE x PATCH_SIZE patches.

    Args:
        image_path (str): Path to the image.
        save_dir (str): Directory to save patches.
        image_bounds (list|tuple): [[minLat, minLng], [maxLat, maxLng]] mapping image pixels to Leaflet coordinates.
            If not provided, lat/lng will be returned as 0.
        patch_size (int): Patch size used for tiling.

    Returns:
        List[dict]: Each patch info as {'path', 'lat', 'lng', 'area'}
    """
    os.makedirs(save_dir, exist_ok=True)
    img = Image.open(image_path)
    width, height = img.size

    patch_list = []
    patch_id = 0

    image_bounds_ok = (
        isinstance(image_bounds, (list, tuple))
        and len(image_bounds) == 2
        and len(image_bounds[0]) == 2
        and len(image_bounds[1]) == 2
    )

    if image_bounds_ok:
        (min_lat, min_lng) = image_bounds[0]
        (max_lat, max_lng) = image_bounds[1]

    # ✅ Loop over y and x with proper handling of edges
    for y in range(0, height, patch_size):
        for x in range(0, width, patch_size):
            # Calculate box ensuring we don't exceed image boundaries
            right = min(x + patch_size, width)
            bottom = min(y + patch_size, height)
            box = (x, y, right, bottom)

            patch = img.crop(box)
            patch_file = os.path.join(save_dir, f"patch_{patch_id}.png")
            patch.save(patch_file)

            # 🔹 Map patch center into Leaflet lat/lng bounds.
            lat, lng = 0, 0
            if image_bounds_ok:
                center_x = x + (right - x) / 2.0
                center_y = y + (bottom - y) / 2.0

                # X increases to the east, Y increases to the south (downwards in image space).
                lng = min_lng + (center_x / float(width)) * (max_lng - min_lng)
                lat = max_lat - (center_y / float(height)) * (max_lat - min_lat)

            patch_list.append({
                "path": patch_file,
                "lat": lat,
                "lng": lng,
                "area": f"Patch_{patch_id}"
            })
            patch_id += 1

    # Persist metadata so it can be reloaded later without losing coordinates
    meta_path = os.path.join(save_dir, "patches_meta.json")
    with open(meta_path, "w") as f:
        json.dump(patch_list, f)

    return patch_list


def create_multiple_patches(image_path, save_dir, image_bounds=None, patch_sizes=PATCH_SIZES):
    """
    Create patches with multiple resolutions for multi-scale analysis.
    
    Args:
        image_path (str): Path to the image.
        save_dir (str): Base directory to save patch sets.
        image_bounds (list|tuple): [[minLat, minLng], [maxLat, maxLng]] bounds.
        patch_sizes (list): List of patch sizes to create (default: [128, 256, 512]).

    Returns:
        dict: {patch_size: patch_list} - patches organized by size
    """
    multi_patches = {}
    
    for patch_size in patch_sizes:
        # Create subdirectory for each patch size
        size_dir = os.path.join(save_dir, f"patches_{patch_size}")
        patches = create_patches(image_path, size_dir, image_bounds, patch_size)
        multi_patches[patch_size] = patches
        print(f"✅ Created {len(patches)} patches of size {patch_size}px")
    
    return multi_patches
