import base64
import io
import modal
from PIL import Image

# 1. Define container image with all required AI libraries
app_image = (
    modal.Image.debian_slim()
    .pip_install(
        "transformers", 
        "torch", 
        "torchvision",  # <--- Add this line here
        "pillow", 
        "fastapi[standard]",
        "numpy"
    )
)  

app = modal.App("grazia-segmentation-api", image=app_image)

@app.function(
    gpu="T4",  # Powerful Nvidia T4 GPU
    timeout=60
)
@modal.fastapi_endpoint(method="POST")
def process_segmentation(data: dict):
    from transformers import pipeline
    import numpy as np

    # 1. Decode Image from React
    image_data = data.get("image")
    if not image_data: 
        return {"error": "No image provided"}, 400
    if "," in image_data: 
        image_data = image_data.split(",")[1]
    
    image = Image.open(io.BytesIO(base64.b64decode(image_data))).convert("RGB")

    # 2. Run High-Resolution SegFormer B5 Segmentation
    segmenter = pipeline(
        "image-segmentation", 
        model="nvidia/segformer-b5-finetuned-ade-640-640"
    )

    results = segmenter(image)

    # 3. Filter for wall or tile segments
    wall_masks = [
        res["mask"] for res in results 
        if any(keyword in res.get("label", "").lower() for keyword in ["wall", "tile", "partition"])
    ]

    # Fallback to primary segment if label doesn't match precisely
    final_mask = wall_masks[0] if wall_masks else results[0]["mask"]

    # 4. Convert Mask to PNG Base64
    buffered = io.BytesIO()
    final_mask.save(buffered, format="PNG")
    mask_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

    return {"mask": f"data:image/png;base64,{mask_b64}"}