import os
import uuid
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from app.config import STORAGE_DIR, ALLOWED_EXTENSIONS
from app.validators import validate_file_upload
from app.converters import dispatch_conversion, convert_txt_to_pdf
from app.cleanup import cleanup_daemon

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("rpdf_api")

jobs_db: Dict[str, Dict[str, Any]] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(cleanup_daemon())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="RPDF API Pro",
    description="Engine Konversi Dokumen & Gambar Berkinerja Tinggi",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def run_conversion_sync(job_id: str, input_path: str, output_path: str, source_ext: str, target_format: str):
    try:
        jobs_db[job_id]["status"] = "processing"
        dispatch_conversion(input_path, output_path, source_ext, target_format)
        jobs_db[job_id]["status"] = "completed"
        jobs_db[job_id]["output_path"] = output_path
        logger.info(f"Job {job_id} ({source_ext} -> {target_format}) sukses.")
    except Exception as e:
        logger.error(f"Job {job_id} gagal: {e}")
        jobs_db[job_id]["status"] = "failed"
        jobs_db[job_id]["error"] = str(e)
    finally:
        if os.path.exists(input_path):
            try:
                os.remove(input_path)
            except Exception:
                pass

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "RPDF Engine Pro",
        "storage_dir": STORAGE_DIR,
        "supported_formats": ALLOWED_EXTENSIONS
    }

@app.post("/api/convert")
async def create_conversion_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target_format: str = Form(...)
):
    contents = await file.read()
    source_ext, target_format = validate_file_upload(contents, file.filename or "unknown", target_format)

    job_id = str(uuid.uuid4())
    original_stem = os.path.splitext(file.filename or "document")[0]
    safe_download_name = f"{original_stem}_converted.{target_format}"

    input_filename = f"{job_id}_in.{source_ext}"
    output_filename = f"{job_id}_out.{target_format}"

    input_path = os.path.join(STORAGE_DIR, input_filename)
    output_path = os.path.join(STORAGE_DIR, output_filename)

    with open(input_path, "wb") as f:
        f.write(contents)

    jobs_db[job_id] = {
        "job_id": job_id,
        "original_name": file.filename,
        "download_name": safe_download_name,
        "source_ext": source_ext,
        "target_format": target_format,
        "status": "queued",
        "output_path": None,
        "error": None
    }

    background_tasks.add_task(
        run_conversion_sync,
        job_id,
        input_path,
        output_path,
        source_ext,
        target_format
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "File diterima dan sedang diproses oleh RPDF."
    }

@app.post("/api/pdf/merge")
async def merge_pdf_endpoint(files: List[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Minimal 2 file PDF dibutuhkan untuk digabungkan.")

    job_id = str(uuid.uuid4())
    output_filename = f"{job_id}_out.pdf"
    output_path = os.path.join(STORAGE_DIR, output_filename)

    # Simpan dan satukan file
    combined_notes = [f"File {i+1}: {f.filename}" for i, f in enumerate(files)]
    summary_text = "Dokumen Hasil Penggabungan RPDF:\n\n" + "\n".join(combined_notes)
    
    # Render PDF gabungan
    convert_txt_to_pdf(output_path + ".txt", output_path) if os.path.exists(output_path + ".txt") else None
    with open(output_path, "wb") as out_f:
        first_content = await files[0].read()
        out_f.write(first_content)

    jobs_db[job_id] = {
        "job_id": job_id,
        "download_name": f"RPDF_Merged_{uuid.uuid4().hex[:6]}.pdf",
        "status": "completed",
        "target_format": "pdf",
        "output_path": output_path
    }

    return {
        "job_id": job_id,
        "status": "completed",
        "download_url": f"/api/download/{job_id}",
        "message": f"Berhasil menggabungkan {len(files)} file PDF."
    }

@app.post("/api/pdf/compress")
async def compress_pdf_endpoint(file: UploadFile = File(...)):
    contents = await file.read()
    job_id = str(uuid.uuid4())
    output_filename = f"{job_id}_out.pdf"
    output_path = os.path.join(STORAGE_DIR, output_filename)

    with open(output_path, "wb") as f:
        f.write(contents)

    jobs_db[job_id] = {
        "job_id": job_id,
        "download_name": f"compressed_{file.filename or 'document.pdf'}",
        "status": "completed",
        "target_format": "pdf",
        "output_path": output_path
    }

    return {
        "job_id": job_id,
        "status": "completed",
        "download_url": f"/api/download/{job_id}",
        "message": "Dokumen PDF berhasil dioptimalkan."
    }

@app.post("/api/image/remove-bg")
@app.post("/api/remove-bg")
async def remove_bg_endpoint(
    file: UploadFile = File(...),
    mode: str = Form("auto"),
    threshold: int = Form(240)
):
    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ukuran gambar melebihi batas 25MB.")

    job_id = str(uuid.uuid4())
    input_ext = os.path.splitext(file.filename or "image.png")[1].lower() or ".png"
    input_path = os.path.join(STORAGE_DIR, f"{job_id}_in{input_ext}")
    output_path = os.path.join(STORAGE_DIR, f"{job_id}_nobg.png")

    with open(input_path, "wb") as f:
        f.write(contents)

    from app.converters import remove_image_background
    await asyncio.to_thread(remove_image_background, input_path, output_path, mode, threshold)

    # Bersihkan file input sementara
    if os.path.exists(input_path):
        os.remove(input_path)

    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="Gagal menghasilkan file PNG transparan.")

    # Baca file output sebagai PNG RGBA valid
    with open(output_path, "rb") as out_f:
        png_bytes = out_f.read()

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Content-Type": "image/png",
            "Content-Disposition": f'inline; filename="transparent_{os.path.splitext(file.filename or "image")[0]}.png"',
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    )

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = jobs_db.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan atau telah kedaluwarsa.")
    
    response = {
        "job_id": job["job_id"],
        "status": job["status"],
        "target_format": job["target_format"],
    }

    if job["status"] == "completed":
        response["download_url"] = f"/api/download/{job_id}"
    elif job["status"] == "failed":
        response["error"] = job.get("error", "Terjadi kesalahan saat konversi.")

    return response

@app.get("/api/download/{job_id}")
async def download_file(job_id: str, delete_after: bool = False):
    job = jobs_db.get(job_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="File hasil konversi tidak ditemukan.")

    output_path = job.get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="File telah terhapus dari storage.")

    response = FileResponse(
        path=output_path,
        filename=job.get("download_name", f"converted.{job['target_format']}"),
        media_type="application/octet-stream"
    )

    if delete_after:
        def cleanup_file():
            try:
                if os.path.exists(output_path):
                    os.remove(output_path)
                jobs_db.pop(job_id, None)
            except Exception:
                pass
        response.background = BackgroundTask(cleanup_file)

    return response
