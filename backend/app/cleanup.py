import os
import time
import asyncio
import logging
from app.config import STORAGE_DIR, FILE_TTL_SECONDS, CLEANUP_INTERVAL_SECONDS

logger = logging.getLogger("cleanup_worker")

def purge_expired_files():
    """Hapus file-file sementara yang telah melewati batas waktu (TTL)."""
    now = time.time()
    deleted_count = 0

    if not os.path.exists(STORAGE_DIR):
        return deleted_count

    for filename in os.listdir(STORAGE_DIR):
        file_path = os.path.join(STORAGE_DIR, filename)
        if os.path.isfile(file_path):
            try:
                file_age = now - os.path.getmtime(file_path)
                if file_age > FILE_TTL_SECONDS:
                    os.remove(file_path)
                    deleted_count += 1
            except Exception as e:
                logger.warning(f"Gagal menghapus file kadaluwarsa {file_path}: {e}")

    if deleted_count > 0:
        logger.info(f"Auto-cleanup: Berhasil membersihkan {deleted_count} file kedaluwarsa.")
    return deleted_count

async def cleanup_daemon():
    """Background task yang berjalan terus-menerus selama server hidup."""
    logger.info("Daemon auto-cleanup aktif.")
    while True:
        try:
            purge_expired_files()
        except Exception as e:
            logger.error(f"Error pada siklus pembersihan: {e}")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
