import numpy as np
from PIL import Image
from collections import Counter
import math

# Map integers → labels
INT_TO_LABEL = {0: "Demolished", 1: "Change", 2: "No Change"}

# Color map for visualization (must match INT_TO_LABEL keys)
COLOR_DICT = {"No Change": [0, 255, 0], "Change": [255, 0, 0], "Demolished": [0, 0, 255]}

def generate_stats(predictions):
    """
    Count how many patches belong to each class.
    Always return the three expected categories with percentage strings.
    """
    labels = [INT_TO_LABEL.get(p, "Unknown") for p in predictions]
    counter = Counter(labels)
    total = sum(counter.values())
    if total == 0:
        return {"No Change": "0.0%", "Change": "0.0%", "Demolished": "0.0%"}

    stats = {
        "No Change": f"{counter['No Change']/total*100:.1f}%",
        "Change": f"{counter['Change']/total*100:.1f}%",
        "Demolished": f"{counter['Demolished']/total*100:.1f}%",
    }

    if counter.get("Unknown", 0) > 0:
        stats["Unknown"] = f"{counter['Unknown']/total*100:.1f}%"


    return stats

def generate_color_map(predictions, width, height, patch_size=256):
    """
    Reconstruct full image from patch predictions with color-coded patches
    Returns PIL.Image
    """
    # Must match create_patches() grid so indices align.
    rows = int(math.ceil(height / patch_size))
    cols = int(math.ceil(width / patch_size))

    img_array = np.zeros((rows * patch_size, cols * patch_size, 3), dtype=np.uint8)
    default_color = [128, 128, 128]

    idx = 0
    for i in range(rows):
        for j in range(cols):
            if idx < len(predictions):
                label = INT_TO_LABEL.get(predictions[idx], "Unknown")
                color = COLOR_DICT.get(label, default_color)
            else:
                color = default_color

            img_array[
                i * patch_size : (i + 1) * patch_size,
                j * patch_size : (j + 1) * patch_size,
            ] = color
            idx += 1

    # Crop back to the original image size.
    return Image.fromarray(img_array[:height, :width])

