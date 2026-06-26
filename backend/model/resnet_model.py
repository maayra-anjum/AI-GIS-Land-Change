import torch
import torch.nn as nn
from torchvision import models

def resnet_model(num_classes=3, pretrained=False):
    model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT if pretrained else None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    return model


def load_model(num_classes=3, weights_path=None, device="cpu"):
    model = resnet_model(num_classes=num_classes, pretrained=False)

    if weights_path:
        try:
            state = torch.load(weights_path, map_location=device, weights_only=True)
        except TypeError:
            # older PyTorch versions don't support weights_only
            state = torch.load(weights_path, map_location=device)

        # Handle checkpoint dicts that wrap the state_dict
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]

        # Strip common key prefixes added by DataParallel / Lightning
        cleaned = {}
        for k, v in state.items():
            new_k = k.replace("module.", "").replace("model.", "")
            cleaned[new_k] = v

        missing, unexpected = model.load_state_dict(cleaned, strict=False)
        if missing:
            print(f"⚠️ Missing keys when loading weights: {missing}")
        if unexpected:
            print(f"⚠️ Unexpected keys when loading weights: {unexpected}")

    model.to(device)
    model.eval()
    return model