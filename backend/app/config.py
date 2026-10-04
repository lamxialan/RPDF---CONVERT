import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = os.getenv("STORAGE_DIR", str(BASE_DIR / "temp_storage"))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "25"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
FILE_TTL_SECONDS = int(os.getenv("FILE_TTL_SECONDS", "3600"))  # 1 Jam TTL
CLEANUP_INTERVAL_SECONDS = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "300"))  # 5 Menit

ALLOWED_EXTENSIONS = {
    # Dokumen
    "pdf": ["docx", "xlsx", "pptx"],
    "docx": ["pdf"],
    "xlsx": ["pdf"],
    "pptx": ["pdf"],
    "txt": ["pdf"],
    
    # Gambar & Grafis
    "png": ["jpg", "webp", "pdf"],
    "jpg": ["png", "webp", "pdf"],
    "jpeg": ["png", "webp", "pdf"],
    "webp": ["png", "jpg", "pdf"],
    "heic": ["jpg", "png", "pdf"],
}

os.makedirs(STORAGE_DIR, exist_ok=True)
