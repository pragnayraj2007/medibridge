"""Deploys the MediBridge OCR service (app.py) on Modal: free monthly credits, no card.

    modal secret create medibridge-ocr OCR_TOKEN=<token>
    modal deploy modal_app.py      # run from apps/ocr-service

Scales to zero when idle; models are baked into the image so a cold start only loads them.
"""
import modal

MODELS = dict(
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="PP-OCRv5_mobile_rec",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)


def download_models():
    from paddleocr import PaddleOCR
    PaddleOCR(**MODELS)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libgomp1")
    .pip_install("paddlepaddle>=3.1,<4", "paddleocr>=3.1,<4", "fastapi>=0.115,<1")
    .env({"PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK": "True", "OMP_NUM_THREADS": "2"})
    .run_function(download_models)
    .add_local_file("app.py", "/root/ocr_app.py")
)

app = modal.App("medibridge-ocr", image=image)


@app.function(cpu=2.0, memory=3072, timeout=180, scaledown_window=300,
              secrets=[modal.Secret.from_name("medibridge-ocr")])
@modal.asgi_app()
def web():
    import sys
    sys.path.insert(0, "/root")
    from ocr_app import app as api
    return api
