import os
import io
import math
from typing import List
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

from app.converters import convert_pdf_to_docx

def parse_page_ranges(range_str: str, max_pages: int) -> List[int]:
    """
    Mengurai string rentang halaman (contoh: "1-3, 5, 8-10")
    menjadi daftar indeks halaman 0-indexed yang valid dan berurutan.
    """
    if not range_str or range_str.strip().lower() in ["all", "*", "semua"]:
        return list(range(max_pages))

    selected_pages = set()
    parts = range_str.replace(" ", "").split(",")

    for part in parts:
        if not part:
            continue
        if "-" in part:
            sub = part.split("-")
            try:
                start = int(sub[0]) if sub[0] else 1
                end = int(sub[1]) if sub[1] else max_pages
            except ValueError:
                continue

            # Konversi ke 0-indexed dan batasi dalam jangkauan
            start_idx = max(0, start - 1)
            end_idx = min(max_pages - 1, end - 1)
            for p in range(start_idx, end_idx + 1):
                selected_pages.add(p)
        else:
            try:
                page_num = int(part)
                idx = page_num - 1
                if 0 <= idx < max_pages:
                    selected_pages.add(idx)
            except ValueError:
                continue

    result = sorted(list(selected_pages))
    if not result:
        return list(range(max_pages))
    return result

def split_pdf_pages(input_path: str, output_path: str, page_range_str: str) -> int:
    """
    Memecah atau mengekstrak halaman PDF berdasarkan string rentang halaman.
    Mengembalikan jumlah halaman yang berhasil diekstrak.
    """
    reader = PdfReader(input_path)
    total_pages = len(reader.pages)
    if total_pages == 0:
        raise ValueError("Dokumen PDF kosong atau tidak memiliki halaman.")

    pages_to_keep = parse_page_ranges(page_range_str, total_pages)
    writer = PdfWriter()

    for idx in pages_to_keep:
        writer.add_page(reader.pages[idx])

    with open(output_path, "wb") as f:
        writer.write(f)

    return len(pages_to_keep)

def compress_pdf_file(input_path: str, output_path: str, compression_level: str = "recommended") -> tuple[int, int, float]:
    """
    Mengompres file PDF menggunakan PyMuPDF (fitz) dengan optimasi objek, font,
    dan kompresi ulang gambar (JPEG re-encoding) untuk reduksi ukuran riil yang signifikan.
    Preset:
    - 'recommended': Kualitas standar seimbang (Quality ~75, max_dim 1600)
    - 'extreme': Ukuran super kecil (Quality ~60, max_dim 1000)
    """
    orig_size = os.path.getsize(input_path) if os.path.exists(input_path) else 0

    try:
        import fitz
        from PIL import Image

        doc = fitz.open(input_path)

        quality = 75 if compression_level == "recommended" else 60
        max_dim = 1600 if compression_level == "recommended" else 1000

        # Optimasi dan kompres ulang gambar yang tersemat di PDF
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue
                    image_bytes = base_image["image"]
                    
                    pil_img = Image.open(io.BytesIO(image_bytes))
                    
                    # Resize jika dimensi gambar terlalu besar
                    if pil_img.width > max_dim or pil_img.height > max_dim:
                        pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

                    if pil_img.mode in ("RGBA", "LA", "P"):
                        if "A" in pil_img.mode:
                            bg = Image.new("RGB", pil_img.size, (255, 255, 255))
                            bg.paste(pil_img, mask=pil_img.split()[-1])
                            pil_img = bg
                        else:
                            pil_img = pil_img.convert("RGB")
                    elif pil_img.mode != "RGB":
                        pil_img = pil_img.convert("RGB")

                    out_buffer = io.BytesIO()
                    pil_img.save(out_buffer, format="JPEG", quality=quality, optimize=True)
                    new_image_bytes = out_buffer.getvalue()

                    if len(new_image_bytes) < len(image_bytes):
                        try:
                            doc.update_stream(xref, new_image_bytes)
                        except Exception:
                            pass
                except Exception:
                    continue

        doc.save(
            output_path,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            garbage=4,
            clean=True
        )
        doc.close()

    except Exception:
        # Fallback ke pypdf jika fitz tidak tersedia atau dokumen spesifik
        reader = PdfReader(input_path)
        writer = PdfWriter()
        for page in reader.pages:
            try:
                page.compress_content_streams()
            except Exception:
                pass
            writer.add_page(page)

        with open(output_path, "wb") as f:
            writer.write(f)

    compressed_size = os.path.getsize(output_path) if os.path.exists(output_path) else orig_size
    saved_bytes = max(0, orig_size - compressed_size)
    saved_percent = round((saved_bytes / orig_size) * 100, 1) if orig_size > 0 else 0.0

    return orig_size, compressed_size, saved_percent

def protect_pdf_file(input_path: str, output_path: str, password: str):
    """
    Mengunci file PDF dengan enkripsi password standar industri (pypdf modern encrypt).
    """
    if not password:
        raise ValueError("Password tidak boleh kosong.")

    reader = PdfReader(input_path)
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    writer.encrypt(user_password=password, owner_password=password)

    with open(output_path, "wb") as f:
        writer.write(f)

def unlock_pdf_file(input_path: str, output_path: str, password: str):
    """
    Membuka proteksi password pada file PDF menggunakan password yang diberikan.
    """
    reader = PdfReader(input_path)

    if reader.is_encrypted:
        decrypt_result = reader.decrypt(password or "")
        # Status decrypt: 0 = gagal, 1 atau 2 = sukses
        if decrypt_result == 0:
            raise ValueError("Password yang dimasukkan salah. Gagal membuka proteksi PDF.")

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    with open(output_path, "wb") as f:
        writer.write(f)

def add_watermark_to_pdf(
    input_path: str,
    output_path: str,
    text: str = "CONFIDENTIAL",
    opacity: float = 0.25,
    rotation: int = 45,
    font_size: int = 48,
    color_hex: str = "#888888"
):
    """
    Menambahkan cap teks watermark diagonal semi-transparan pada setiap halaman PDF.
    """
    reader = PdfReader(input_path)
    writer = PdfWriter()

    for page in reader.pages:
        # Ambil ukuran halaman aktual
        mb = page.mediabox
        page_width = float(mb.width)
        page_height = float(mb.height)

        # Buat overlay watermark transparan dengan ReportLab
        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=(page_width, page_height))
        can.saveState()
        
        # Pindahkan titik pusat ke tengah halaman lalu putar
        can.translate(page_width / 2.0, page_height / 2.0)
        can.rotate(rotation)
        
        # Pengaturan warna, transparansi, dan font
        try:
            fill_color = HexColor(color_hex)
        except Exception:
            fill_color = HexColor("#888888")

        can.setFillColor(fill_color, alpha=max(0.05, min(1.0, opacity)))
        can.setFont("Helvetica-Bold", font_size)
        can.drawCentredString(0, 0, text)
        can.restoreState()
        can.save()

        packet.seek(0)
        watermark_doc = PdfReader(packet)
        watermark_page = watermark_doc.pages[0]

        # Gabungkan overlay watermark ke halaman asli
        page.merge_page(watermark_page)
        writer.add_page(page)

    with open(output_path, "wb") as f:
        writer.write(f)

def add_page_numbers_to_pdf(
    input_path: str,
    output_path: str,
    position: str = "bottom-center",
    format_template: str = "Halaman {n} dari {total}",
    start_number: int = 1,
    font_size: int = 10,
    color_hex: str = "#333333"
):
    """
    Menambahkan nomor halaman otomatis di bagian bawah tengah/kanan atau atas kanan PDF.
    """
    reader = PdfReader(input_path)
    total_pages = len(reader.pages)
    writer = PdfWriter()

    try:
        font_color = HexColor(color_hex)
    except Exception:
        font_color = HexColor("#333333")

    for i, page in enumerate(reader.pages):
        mb = page.mediabox
        page_width = float(mb.width)
        page_height = float(mb.height)

        current_num = start_number + i
        label_text = format_template.replace("{n}", str(current_num)).replace("{total}", str(total_pages))

        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=(page_width, page_height))
        can.setFont("Helvetica", font_size)
        can.setFillColor(font_color)

        # Penentuan koordinat berdasarkan posisi yang dipilih
        if position == "bottom-right":
            can.drawRightString(page_width - 40, 24, label_text)
        elif position == "top-right":
            can.drawRightString(page_width - 40, page_height - 30, label_text)
        elif position == "bottom-left":
            can.drawString(40, 24, label_text)
        else:  # bottom-center (default)
            can.drawCentredString(page_width / 2.0, 24, label_text)

        can.save()
        packet.seek(0)

        overlay_doc = PdfReader(packet)
        page.merge_page(overlay_doc.pages[0])
        writer.add_page(page)

    with open(output_path, "wb") as f:
        writer.write(f)

def convert_images_to_pdf(image_paths: List[str], output_path: str) -> int:
    """
    Menggabungkan multi-file gambar (JPG, PNG, WebP) menjadi satu dokumen PDF terstruktur.
    """
    from PIL import Image

    if not image_paths:
        raise ValueError("Tidak ada gambar yang diunggah untuk dikonversi.")

    rgb_images = []
    for p in image_paths:
        im = Image.open(p)
        if im.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            if "A" in im.mode:
                bg.paste(im, mask=im.split()[-1])
            else:
                bg.paste(im)
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        rgb_images.append(im)

    if not rgb_images:
        raise ValueError("Gambar tidak dapat diproses.")

    rgb_images[0].save(
        output_path,
        "PDF",
        resolution=100.0,
        save_all=True,
        append_images=rgb_images[1:]
    )
    return len(rgb_images)

def convert_pdf_to_images(input_path: str, output_path: str) -> tuple[str, int]:
    """
    Merender setiap halaman dokumen PDF menjadi gambar JPEG/PNG berkualitas tinggi (150 DPI).
    Jika lebih dari 1 halaman, seluruh gambar dikemas ke dalam arsip .ZIP.
    Mengembalikan format target ('zip' atau 'png') dan total halaman.
    """
    import zipfile
    import fitz

    doc = fitz.open(input_path)
    total_pages = len(doc)
    if total_pages == 0:
        doc.close()
        raise ValueError("Dokumen PDF kosong atau tidak memiliki halaman.")

    # 150 DPI rendering (zoom = 150 / 72)
    zoom = 150.0 / 72.0
    mat = fitz.Matrix(zoom, zoom)

    if total_pages == 1:
        page = doc[0]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(output_path)
        doc.close()
        return "png", 1
    else:
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for i, page in enumerate(doc):
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img_bytes = pix.tobytes("png")
                zipf.writestr(f"halaman_{i+1:03d}.png", img_bytes)
        doc.close()
        return "zip", total_pages

def organize_and_rotate_pdf(input_path: str, output_path: str, delete_pages_str: str = "", rotation: int = 0) -> int:
    """
    Menata dokumen PDF: menghapus halaman tertentu dan/atau memutar orientasi halaman (90, 180, 270 derajat).
    """
    delete_indices = set()
    if delete_pages_str and delete_pages_str.strip():
        for part in delete_pages_str.replace(" ", "").split(","):
            if part.isdigit():
                idx = int(part) - 1
                delete_indices.add(idx)

    # Coba PyMuPDF terlebih dahulu
    try:
        import fitz
        doc = fitz.open(input_path)
        total_pages = len(doc)

        valid_deletes = {i for i in delete_indices if 0 <= i < total_pages}
        if len(valid_deletes) >= total_pages:
            doc.close()
            raise ValueError("Tidak dapat menghapus seluruh halaman PDF. Sisakan minimal 1 halaman.")

        for idx in sorted(list(valid_deletes), reverse=True):
            doc.delete_page(idx)

        if rotation in [90, 180, 270]:
            for page in doc:
                page.set_rotation((page.rotation + rotation) % 360)

        doc.save(output_path, deflate=True, garbage=4, clean=True)
        remaining = len(doc)
        doc.close()
        return remaining

    except Exception:
        # Fallback ke pypdf
        reader = PdfReader(input_path)
        total_pages = len(reader.pages)
        valid_deletes = {i for i in delete_indices if 0 <= i < total_pages}

        if len(valid_deletes) >= total_pages:
            raise ValueError("Tidak dapat menghapus seluruh halaman PDF. Sisakan minimal 1 halaman.")

        writer = PdfWriter()
        kept = 0
        for idx, page in enumerate(reader.pages):
            if idx not in valid_deletes:
                if rotation in [90, 180, 270]:
                    page.rotate(rotation)
                writer.add_page(page)
                kept += 1

        with open(output_path, "wb") as f:
            writer.write(f)
        return kept

# Re-export apply_pdf_annotations
from app.converters import apply_pdf_annotations

