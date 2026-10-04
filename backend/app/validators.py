import os
import puremagic
from fastapi import HTTPException, status
from app.config import MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS

VALID_MIME_MAP = {
    "pdf": ["application/pdf"],
    "docx": [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
        "application/x-zip-compressed",
    ],
    "xlsx": [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
        "application/x-zip-compressed",
    ],
    "pptx": [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/x-zip-compressed",
    ],
    "txt": ["text/plain", "text/plain; charset=utf-8"],
    "png": ["image/png"],
    "jpg": ["image/jpeg"],
    "jpeg": ["image/jpeg"],
    "webp": ["image/webp"],
    "heic": ["image/heic", "image/heif", "application/octet-stream"],
}

def validate_file_upload(file_bytes: bytes, filename: str, target_format: str) -> tuple[str, str]:
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Ukuran file ({len(file_bytes) / (1024 * 1024):.1f}MB) melebihi batas {MAX_FILE_SIZE_MB}MB."
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File yang diunggah kosong."
        )

    _, ext = os.path.splitext(filename.lower())
    source_ext = ext.lstrip(".")
    if not source_ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File tidak memiliki ekstensi yang valid."
        )

    if source_ext not in ALLOWED_EXTENSIONS:
        allowed_list = ", ".join(ALLOWED_EXTENSIONS.keys())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format sumber '.{source_ext}' belum didukung. Format yang didukung: {allowed_list}"
        )

    target_format = target_format.lower().lstrip(".")
    valid_targets = ALLOWED_EXTENSIONS.get(source_ext, [])
    if target_format not in valid_targets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Konversi dari '.{source_ext}' ke '.{target_format}' tidak diizinkan. Pilihan valid: {', '.join(valid_targets)}"
        )

    # Validasi Magic Bytes
    try:
        magic_info = puremagic.magic_string(file_bytes)
        if magic_info and len(magic_info) > 0:
            detected_mime = magic_info[0].mime_type or ""
            allowed_mimes = VALID_MIME_MAP.get(source_ext, [])
            if source_ext not in ["txt", "heic"] and allowed_mimes and detected_mime:
                is_valid = any(
                    allowed in detected_mime.lower() or detected_mime.lower() in allowed
                    for allowed in allowed_mimes
                )
                if not is_valid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Signature biner file tidak cocok dengan ekstensi '.{source_ext}' (terdeteksi: {detected_mime})."
                    )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        pass

    return source_ext, target_format
