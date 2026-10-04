import os
import io
import shutil
import zipfile
import subprocess
from PIL import Image
from pdf2docx import Converter
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def _find_libreoffice_binary() -> str:
    """Mencari path binary LibreOffice di sistem operasi (Linux, Windows, MacOS)."""
    for candidate in ["libreoffice", "soffice"]:
        path = shutil.which(candidate)
        if path:
            return path

    windows_paths = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for wpath in windows_paths:
        if os.path.exists(wpath):
            return wpath

    return "libreoffice"

def fix_docx_for_google_docs(docx_path: str):
    """
    Solusi Fix Broken Image di Google Docs:
    Google Docs tidak mendukung gambar berbasis EMF/WMF atau format non-sRGB yang sering
    diekstrak dari PDF. Fungsi ini membongkar ZIP DOCX, mengonversi seluruh file grafis di
    word/media/ menjadi format PNG/JPEG sRGB standar, dan memperbarui relasi XML.
    """
    if not os.path.exists(docx_path):
        return

    temp_extract = docx_path + "_extracted"
    repack_path = docx_path + "_fixed"

    try:
        with zipfile.ZipFile(docx_path, 'r') as zip_in:
            zip_in.extractall(temp_extract)

        media_dir = os.path.join(temp_extract, "word", "media")
        media_replaced = {}

        if os.path.exists(media_dir):
            for fname in os.listdir(media_dir):
                fpath = os.path.join(media_dir, fname)
                stem, ext = os.path.splitext(fname)
                ext = ext.lower()

                # Jika format gambar EMF, WMF, atau TIFF, konversi ke PNG sRGB
                if ext in [".emf", ".wmf", ".tif", ".tiff"] or ext in [".jpg", ".jpeg", ".png"]:
                    try:
                        with Image.open(fpath) as img:
                            # Paksa konversi ke mode sRGB standar
                            if img.mode not in ("RGB", "RGBA"):
                                img = img.convert("RGBA" if "A" in img.mode else "RGB")

                            new_fname = f"{stem}.png"
                            new_fpath = os.path.join(media_dir, new_fname)
                            img.save(new_fpath, "PNG")

                            if new_fname != fname:
                                os.remove(fpath)
                                media_replaced[fname] = new_fname
                    except Exception:
                        pass

        # Perbarui relasi di document.xml.rels jika ada nama file yang diganti ke .png
        rels_path = os.path.join(temp_extract, "word", "_rels", "document.xml.rels")
        if os.path.exists(rels_path) and media_replaced:
            with open(rels_path, "r", encoding="utf-8") as f:
                content = f.read()
            for old_name, new_name in media_replaced.items():
                content = content.replace(f"media/{old_name}", f"media/{new_name}")
            with open(rels_path, "w", encoding="utf-8") as f:
                f.write(content)

        # Repack ke DOCX
        with zipfile.ZipFile(repack_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for root, _, files in os.walk(temp_extract):
                for file in files:
                    full_p = os.path.join(root, file)
                    arcname = os.path.relpath(full_p, temp_extract)
                    zip_out.write(full_p, arcname)

        if os.path.exists(repack_path):
            os.remove(docx_path)
            os.rename(repack_path, docx_path)

    except Exception as e:
        print(f"[Warning] Google Docs DOCX Image Patch failed: {e}")
    finally:
        if os.path.exists(temp_extract):
            shutil.rmtree(temp_extract, ignore_errors=True)

def convert_pdf_to_docx(input_path: str, output_path: str):
    """Konversi PDF ke DOCX dengan optimasi Google Docs."""
    cv = Converter(input_path)
    try:
        cv.convert(output_path, start=0, end=None)
    finally:
        cv.close()

    # Terapkan patch kompatibilitas Google Docs
    fix_docx_for_google_docs(output_path)

def convert_office_document(input_path: str, output_path: str, target_ext: str):
    """Konversi dokumen Office (DOCX, XLSX, PPTX) ke PDF atau sebaliknya via LibreOffice."""
    lo_bin = _find_libreoffice_binary()
    out_dir = os.path.dirname(output_path)
    
    cmd = [
        lo_bin,
        "--headless",
        "--convert-to", target_ext,
        "--outdir", out_dir,
        input_path
    ]
    
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"Gagal eksekusi LibreOffice: {result.stderr or result.stdout}")
    except FileNotFoundError:
        raise RuntimeError("LibreOffice tidak ditemukan. Pastikan LibreOffice terinstal atau jalankan container Docker.")

    base_name = os.path.splitext(os.path.basename(input_path))[0]
    generated_file = os.path.join(out_dir, f"{base_name}.{target_ext}")
    if os.path.exists(generated_file) and generated_file != output_path:
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(generated_file, output_path)

def convert_image_to_pdf(input_path: str, output_path: str):
    """Mengonversi gambar tunggal (PNG/JPG/WEBP/HEIC) menjadi dokumen PDF proporsional."""
    with Image.open(input_path) as img:
        rgb_img = img.convert("RGB")
        rgb_img.save(output_path, "PDF", resolution=100.0)

def convert_txt_to_pdf(input_path: str, output_path: str):
    """Konversi file teks ke PDF menggunakan ReportLab."""
    doc = SimpleDocTemplate(output_path, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle('TxtStyle', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=14)

    story = []
    with open(input_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            sanitized = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Spacer(1, 10) if sanitized.strip() == "" else Paragraph(sanitized, body_style))

    if not story:
        story.append(Paragraph("(Dokumen Kosong)", body_style))
    doc.build(story)

def remove_white_background_chromakey(img: Image.Image, threshold: int = 240, tolerance: int = 25) -> Image.Image:
    """
    Algoritma Chroma Key / Color Thresholding presisi tinggi khusus logo, ikon, dan vektor siluet.
    Mengubah semua piksel putih murni (#FFFFFF) dan mendekati putih (RGB >= threshold) menjadi transparan (Alpha = 0).
    Dilengkapi penghalusan tepi (edge antialiasing) agar siluet tidak bergerigi.
    """
    rgba = img.convert("RGBA")
    
    try:
        import numpy as np
        data = np.array(rgba)
        r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]
        
        # Deteksi piksel putih solid (RGB tinggi dan selisih antar kanal warna kecil)
        is_white = (
            (r >= threshold) & (g >= threshold) & (b >= threshold) &
            (np.abs(r.astype(int) - g.astype(int)) <= tolerance) &
            (np.abs(g.astype(int) - b.astype(int)) <= tolerance)
        )
        # Set alpha = 0 untuk background putih
        data[is_white, 3] = 0
        
        # Soft edge antialiasing pada perbatasan (transisi 15 poin di bawah threshold)
        soft_mask = (r >= threshold - 15) & (g >= threshold - 15) & (b >= threshold - 15) & ~is_white
        if np.any(soft_mask):
            brightness = (r[soft_mask].astype(float) + g[soft_mask].astype(float) + b[soft_mask].astype(float)) / 3.0
            alpha_factor = (255.0 - brightness) / max(1.0, (255.0 - (threshold - 15)))
            data[soft_mask, 3] = np.clip(data[soft_mask, 3] * alpha_factor, 0, 255).astype(np.uint8)
            
        return Image.fromarray(data, "RGBA")
    except Exception:
        # Fallback algoritma Pillow murni tanpa NumPy
        pixels = rgba.load()
        w, h = rgba.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                if r >= threshold and g >= threshold and b >= threshold and \
                   abs(r - g) <= tolerance and abs(g - b) <= tolerance:
                    pixels[x, y] = (r, g, b, 0)
                elif r >= threshold - 15 and g >= threshold - 15 and b >= threshold - 15:
                    avg = (r + g + b) / 3.0
                    alpha_factor = (255.0 - avg) / max(1.0, (255.0 - (threshold - 15)))
                    new_a = int(a * alpha_factor)
                    pixels[x, y] = (r, g, b, max(0, min(255, new_a)))
        return rgba

def is_mostly_white_background(img: Image.Image, corner_threshold: int = 235) -> bool:
    """Mendeteksi apakah gambar memiliki sudut/latar belakang putih solid (seperti logo/ikon)."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    sample_points = [
        (0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
        (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)
    ]
    white_count = 0
    for x, y in sample_points:
        p = rgba.getpixel((x, y))
        if p[0] >= corner_threshold and p[1] >= corner_threshold and p[2] >= corner_threshold:
            white_count += 1
    return white_count >= 5

def remove_image_background(input_path: str, output_path: str, mode: str = "auto", threshold: int = 240):
    """
    Engine AI & Fallback Chroma Key untuk menghapus background gambar:
    1. Jika mode 'white_bg' atau terdeteksi logo/vektor berlatar putih:
       Menggunakan algoritma Color Thresholding / Chroma Key untuk hasil 100% bersih tanpa artifak U2-Net.
    2. Jika mode 'ai' atau foto umum:
       Menggunakan rembg dengan session model 'isnet-general-use' atau 'u2netp' yang jauh lebih peka
       terhadap objek grafis dan non-manusia.
    3. Input dan output SELALU dipaksa dalam format RGBA murni (.png).
    """
    with Image.open(input_path) as raw_img:
        img_rgba = raw_img.convert("RGBA")
        
        should_chroma_key = (mode == "white_bg") or (mode == "auto" and is_mostly_white_background(img_rgba))
        
        if should_chroma_key:
            result_img = remove_white_background_chromakey(img_rgba, threshold=threshold)
            result_img.save(output_path, "PNG", optimize=True)
            return

        # AI Neural Network Cutout via rembg
        try:
            from rembg import remove, new_session
            # Utamakan session model isnet-general-use atau u2netp
            session = None
            for model_name in ["isnet-general-use", "u2netp", "u2net"]:
                try:
                    session = new_session(model_name)
                    break
                except Exception:
                    continue
            
            output_img = remove(img_rgba, session=session) if session else remove(img_rgba)
            final_rgba = output_img.convert("RGBA")
            
            # Jika rembg masih menyisakan latar putih di sudut, poles dengan thresholding
            if is_mostly_white_background(final_rgba):
                final_rgba = remove_white_background_chromakey(final_rgba, threshold=threshold)
                
            final_rgba.save(output_path, "PNG", optimize=True)
        except Exception as e:
            print(f"[RemoveBG Engine] Rembg execution notice: {e}. Executing Chroma Key fallback.")
            result_img = remove_white_background_chromakey(img_rgba, threshold=threshold)
            result_img.save(output_path, "PNG", optimize=True)

def convert_image(input_path: str, output_path: str, target_format: str):
    """Konversi gambar antar format PNG, JPG, WEBP, HEIC."""
    target_format = target_format.lower()
    with Image.open(input_path) as img:
        if target_format in ["jpg", "jpeg"]:
            if img.mode in ("RGBA", "LA", "P"):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                bg.paste(img, mask=img.split()[-1])
                bg.save(output_path, "JPEG", quality=92)
                return
            img.convert("RGB").save(output_path, "JPEG", quality=92)
        elif target_format == "webp":
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA")
            img.save(output_path, "WEBP", quality=90)
        elif target_format == "png":
            img.save(output_path, "PNG")
        else:
            raise ValueError(f"Target format gambar '{target_format}' tidak didukung.")

def dispatch_conversion(input_path: str, output_path: str, source_ext: str, target_ext: str):
    """Pusat routing cerdas seluruh alur konversi file."""
    source_ext = source_ext.lower()
    target_ext = target_ext.lower()

    # 1. PDF ➔ DOCX (Dengan patch Google Docs)
    if source_ext == "pdf" and target_ext == "docx":
        convert_pdf_to_docx(input_path, output_path)

    # 2. PDF ➔ XLSX / PPTX
    elif source_ext == "pdf" and target_ext in ["xlsx", "pptx"]:
        convert_office_document(input_path, output_path, target_ext)

    # 3. Office (DOCX, XLSX, PPTX) ➔ PDF
    elif source_ext in ["docx", "xlsx", "pptx"] and target_ext == "pdf":
        convert_office_document(input_path, output_path, "pdf")

    # 4. Teks ➔ PDF
    elif source_ext == "txt" and target_ext == "pdf":
        convert_txt_to_pdf(input_path, output_path)

    # 5. Gambar (PNG, JPG, WEBP, HEIC) ➔ PDF
    elif source_ext in ["png", "jpg", "jpeg", "webp", "heic"] and target_ext == "pdf":
        convert_image_to_pdf(input_path, output_path)

    # 6. Gambar ➔ Gambar
    elif source_ext in ["png", "jpg", "jpeg", "webp", "heic"] and target_ext in ["png", "jpg", "jpeg", "webp"]:
        convert_image(input_path, output_path, target_ext)

    else:
        raise ValueError(f"Kombinasi konversi dari '{source_ext}' ke '{target_ext}' tidak didukung.")
