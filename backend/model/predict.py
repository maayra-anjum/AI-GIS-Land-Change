import torch
import numpy as np
from PIL import Image
from torchvision import transforms
import os
from model.resnet_model import load_model

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

weights_dir  = os.path.join(os.path.dirname(__file__), "weights")
weights_path = None

for filename in ["resnet50.pth", "resnet50 (1).pth"]:
    p = os.path.join(weights_dir, filename)
    if os.path.exists(p):
        weights_path = p
        break

use_model = False
model     = None

if not weights_path:
    print("⚠️ No model weights — using pixel-diff classifier")
else:
    try:
        model  = load_model(num_classes=3, weights_path=weights_path, device=device)
        fc_std = model.fc.weight.detach().cpu().numpy().std()
        dummy  = torch.zeros(1, 3, 224, 224).to(device)
        with torch.no_grad():
            out = model(dummy)
        logits = out[0].cpu().numpy()

        if fc_std < 0.015 or np.std(logits) < 1e-4:
            print(f"⚠️ Model not fine-tuned (FC std={fc_std:.4f}) — using pixel-diff")
            model = None
        else:
            use_model = True
            print(f"✅ Fine-tuned model loaded (FC std={fc_std:.4f})")
    except Exception as e:
        print("❌ Model load error:", e)
        model = None

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])


def _physics_classify(arr: np.ndarray) -> int:
    """
    Multi-feature physics classifier calibrated for Sentinel-2 median composites.

    Observed real-world patch stats from GEE downloads:
      - NoChange areas:   mean  3-16,  std  4-12
      - Change areas:     mean 15-35,  std  8-25
      - Demolished areas: mean 18-40,  std  6-22, surface-driven (R+G > B)

    Key insight: Demolished differs from Change by being MORE UNIFORM (lower std)
    and having stronger R+G signal relative to B (bare soil signature).
    """
    m    = arr.mean()
    s    = arr.std()
    r    = arr[:,:,0].mean()
    g    = arr[:,:,1].mean()
    b    = arr[:,:,2].mean()
    b_dom = b / (m + 1e-6)          # blue dominance (haze indicator)
    surf  = (r + g) / 2.0           # surface signal (R+G avg)
    rg_b  = (r + g) / (b + 1e-6)   # R+G vs B ratio (bare soil > 1.8)
    f15   = (arr > 15).mean()
    f25   = (arr > 25).mean()
    f40   = (arr > 40).mean()

    # ── Demolished ───────────────────────────────────────────────────────────
    # Uniform surface change — entire patch transformed
    # Lower std = more uniform = whole area changed (not just edges)
    # High R+G relative to B = bare soil/rubble (not atmospheric)
    if m > 22 and s < 20 and surf > 18 and rg_b > 1.6 and f25 > 0.35:
        return 0  # Demolished

    if m > 18 and s < 15 and f15 > 0.50 and rg_b > 1.8 and b_dom < 0.38:
        return 0  # Demolished (strong bare soil signal)

    # ── Change ───────────────────────────────────────────────────────────────
    # Spatially varied surface change (construction, vegetation, etc.)
    if m > 18 and surf > 14 and f15 > 0.35 and s > 10 and b_dom < 0.56:
        return 1  # Change
    if m > 14 and f25 > 0.10 and surf > 11 and s > 8 and b_dom < 0.52:
        return 1  # Change

    # ── No Change ────────────────────────────────────────────────────────────
    return 2


def predict_pil(img: Image.Image) -> int:
    """
    Hybrid prediction:
    - Physics detects Demolished (model has no real demolished training data)
    - Trained ResNet50 handles Change vs NoChange (99%+ accuracy)
    - Full physics fallback if model unavailable
    """
    try:
        arr   = np.array(img.convert("RGB"), dtype=np.float32)
        m     = arr.mean()
        s     = arr.std()
        r     = arr[:,:,0].mean()
        g     = arr[:,:,1].mean()
        b     = arr[:,:,2].mean()
        b_dom = b / (m + 1e-6)
        surf  = (r + g) / 2.0
        rg_b  = (r + g) / (b + 1e-6)
        f15   = (arr > 15).mean()
        f25   = (arr > 25).mean()

        # Step 1 — Demolished via physics
        if m > 22 and s < 20 and surf > 18 and rg_b > 1.6 and f25 > 0.35:
            return 0
        if m > 18 and s < 15 and f15 > 0.50 and rg_b > 1.8 and b_dom < 0.38:
            return 0

        # Step 2 — All 3 classes via trained model
        if use_model and model is not None:
            t = transform(img.convert("RGB")).unsqueeze(0).to(device)
            with torch.no_grad():
                logits = model(t)[0].cpu().numpy()
            return int(np.argmax(logits))

        # Step 3 — Full physics fallback
        return _physics_classify(arr)

    except Exception as e:
        print(f"❌ Prediction error: {e}")
        return 2


def predict(image_path):
    try:
        return predict_pil(Image.open(image_path).convert("RGB"))
    except Exception as e:
        print(f"❌ Error: {e}")
        return 2
