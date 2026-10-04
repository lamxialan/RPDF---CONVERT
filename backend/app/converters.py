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

def apply_pdf_annotations(input_path: str, output_path: str, annotations_payload) -> int:
    """
    Menyisipkan anotasi (teks, tanda tangan, stempel gambar, kotak whiteout, shapes, highlight, link)
    dan manipulasi halaman (rotate, insert, delete) ke dokumen PDF menggunakan PyMuPDF (fitz)
    sesuai standar Sejda PDF Editor.
    """
    import fitz
    import base64

    doc = fitz.open(input_path)

    # Normalisasi format payload
    deleted_pages = []
    page_rotations = {}
    insert_pages = []
    annotations = []
    pages_structure = []
    replacements = []

    if isinstance(annotations_payload, dict) and ("annotations" in annotations_payload or "deleted_pages" in annotations_payload or "pages_structure" in annotations_payload):
        annotations = annotations_payload.get("annotations", [])
        deleted_pages = annotations_payload.get("deleted_pages", [])
        page_rotations = annotations_payload.get("page_rotations", {})
        insert_pages = annotations_payload.get("insert_pages", [])
        pages_structure = annotations_payload.get("pages_structure", [])
        replacements = annotations_payload.get("replacements", [])
    elif isinstance(annotations_payload, list):
        annotations = annotations_payload
    elif isinstance(annotations_payload, dict):
        for page_k, items in annotations_payload.items():
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        if "page" not in item:
                            try:
                                item["page"] = int(page_k)
                            except Exception:
                                item["page"] = 1
                        annotations.append(item)

    # 1. Jika ada pages_structure, bangun ulang dokumen sesuai urutan baru
    if pages_structure and isinstance(pages_structure, list):
        new_doc = fitz.open()
        for p_info in pages_structure:
            if not isinstance(p_info, dict):
                continue
            is_new = bool(p_info.get("isNew") or p_info.get("is_new"))
            pw = float(p_info.get("width") or 595.0)
            ph = float(p_info.get("height") or 842.0)
            if is_new:
                new_doc.new_page(-1, width=pw, height=ph)
            else:
                orig_idx = int(p_info.get("originalPageIndex", p_info.get("original_index", 0)))
                if 0 <= orig_idx < len(doc):
                    new_doc.insert_pdf(doc, from_page=orig_idx, to_page=orig_idx)
                    rot = int(p_info.get("rotation", 0)) % 360
                    if rot != 0:
                        new_doc[-1].set_rotation((new_doc[-1].rotation + rot) % 360)
        if len(new_doc) > 0:
            doc.close()
            doc = new_doc
    else:
        # 1b. Rotasi halaman jika diminta secara manual
        for p_str, rot in page_rotations.items():
            try:
                p_idx = int(p_str) - 1
                if 0 <= p_idx < len(doc):
                    doc[p_idx].set_rotation((doc[p_idx].rotation + int(rot)) % 360)
            except Exception:
                pass

        # 2b. Sisipkan halaman kosong baru jika diminta via insert_pages
        for ins in sorted(insert_pages, reverse=True):
            try:
                ins_idx = int(ins)
                if 0 <= ins_idx <= len(doc):
                    doc.new_page(ins_idx, width=595, height=842)
            except Exception:
                pass

    # 2. Terapkan Find & Replace jika disertakan
    if replacements and isinstance(replacements, list):
        for rep in replacements:
            if not isinstance(rep, dict):
                continue
            sq = rep.get("search") or rep.get("search_query")
            rq = rep.get("replace") or rep.get("replace_query") or ""
            target_p = rep.get("page")
            if not sq:
                continue
            for idx, p in enumerate(doc):
                if target_p is not None and (idx + 1) != int(target_p):
                    continue
                matches = p.search_for(str(sq).strip())
                if matches:
                    for rect in matches:
                        p.add_redact_annot(rect, fill=(1, 1, 1))
                    p.apply_redactions()
                    for rect in matches:
                        font_size = max(8.0, min(rect.height * 0.85, 36.0))
                        insert_pt = fitz.Point(rect.x0, rect.y1 - 2)
                        try:
                            p.insert_text(insert_pt, str(rq), fontsize=font_size, color=(0, 0, 0), fontname="helv")
                        except Exception:
                            p.insert_text(insert_pt, str(rq), fontsize=font_size, color=(0, 0, 0))

    # 3. Menerapkan Anotasi
    total_pages = len(doc)
    applied_count = 0

    for ann in annotations:
        if not isinstance(ann, dict):
            continue

        page_num = ann.get("page", 1)
        try:
            page_idx = int(page_num) - 1 if int(page_num) >= 1 else 0
        except (ValueError, TypeError):
            page_idx = 0

        if page_idx < 0 or page_idx >= total_pages:
            continue

        page = doc[page_idx]
        p_width = page.rect.width
        p_height = page.rect.height

        ref_w = float(ann.get("page_width") or p_width)
        ref_h = float(ann.get("page_height") or p_height)
        scale_x = (p_width / ref_w) if ref_w > 0 else 1.0
        scale_y = (p_height / ref_h) if ref_h > 0 else 1.0

        ann_type = str(ann.get("type", "text")).lower()
        x = float(ann.get("x", 0)) * scale_x
        y = float(ann.get("y", 0)) * scale_y
        w = max(1.0, float(ann.get("width", 0)) * scale_x)
        h = max(1.0, float(ann.get("height", 0)) * scale_y)

        # Parse warna hex
        hex_color = str(ann.get("color", "#000000")).lstrip("#")
        if len(hex_color) == 6:
            try:
                r = int(hex_color[0:2], 16) / 255.0
                g = int(hex_color[2:4], 16) / 255.0
                b = int(hex_color[4:6], 16) / 255.0
                color = (r, g, b)
            except ValueError:
                color = (0, 0, 0)
        elif hex_color.lower() in ["fff", "ffffff"]:
            color = (1, 1, 1)
        else:
            color = (0, 0, 0)

        if ann_type == "text":
            text = str(ann.get("text", "")).strip()
            if not text:
                continue
            try:
                raw_font_size = float(ann.get("fontSize") or ann.get("font_size") or 14)
            except (ValueError, TypeError):
                raw_font_size = 14.0
            font_size = max(8.0, raw_font_size * scale_y)

            is_bold = bool(ann.get("isBold") or ann.get("bold"))
            is_italic = bool(ann.get("isItalic") or ann.get("italic"))

            if is_bold and is_italic:
                fontname = "hebi"
            elif is_bold:
                fontname = "hebo"
            elif is_italic:
                fontname = "heit"
            else:
                fontname = "helv"

            rect = fitz.Rect(x, y, x + max(w, 250), y + max(h, font_size * 2))
            try:
                res = page.insert_textbox(rect, text, fontsize=font_size, color=color, fontname=fontname)
                if res < 0:
                    page.insert_text(fitz.Point(x, y + font_size), text, fontsize=font_size, color=color, fontname=fontname)
            except Exception:
                try:
                    page.insert_text(fitz.Point(x, y + font_size), text, fontsize=font_size, color=color, fontname=fontname)
                except Exception:
                    page.insert_text(fitz.Point(x, y + font_size), text, fontsize=font_size, color=color)
            applied_count += 1

        elif ann_type == "whiteout":
            rect = fitz.Rect(x, y, x + w, y + h)
            page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1), width=0)
            applied_count += 1

        elif ann_type == "highlight":
            rect = fitz.Rect(x, y, x + w, y + h)
            page.draw_rect(rect, color=(1, 0.9, 0), fill=(1, 0.9, 0), fill_opacity=0.4, width=0)
            applied_count += 1

        elif ann_type in ["rect", "shape_rect"]:
            rect = fitz.Rect(x, y, x + w, y + h)
            page.draw_rect(rect, color=color, width=2)
            applied_count += 1

        elif ann_type in ["circle", "shape_circle"]:
            rect = fitz.Rect(x, y, x + w, y + h)
            page.draw_oval(rect, color=color, width=2)
            applied_count += 1

        elif ann_type in ["line", "shape_line"]:
            page.draw_line(fitz.Point(x, y), fitz.Point(x + w, y + h), color=color, width=2)
            applied_count += 1

        elif ann_type == "link":
            uri = str(ann.get("url") or ann.get("uri") or "https://")
            rect = fitz.Rect(x, y, x + w, y + h)
            try:
                page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": uri})
            except Exception:
                pass
            applied_count += 1

        elif ann_type == "strikeout":
            page.draw_line(fitz.Point(x, y + h / 2), fitz.Point(x + w, y + h / 2), color=color, width=2)
            applied_count += 1

        elif ann_type == "underline":
            page.draw_line(fitz.Point(x, y + h - 1), fitz.Point(x + w, y + h - 1), color=color, width=2)
            applied_count += 1

        elif ann_type == "arrow":
            p1 = fitz.Point(x, y)
            p2 = fitz.Point(x + w, y + h)
            page.draw_line(p1, p2, color=color, width=2)
            # Arrow head
            applied_count += 1

        elif ann_type == "stamp":
            stamp_text = str(ann.get("stampText") or ann.get("text") or "APPROVED").upper()
            rect = fitz.Rect(x, y, x + w, y + h)
            page.draw_rect(rect, color=color, width=3)
            page.insert_textbox(rect, stamp_text, fontsize=16, color=color, fontname="hebo", align=fitz.TEXT_ALIGN_CENTER)
            applied_count += 1

        elif ann_type == "freehand":
            pts = ann.get("points", [])
            if pts and len(pts) > 1:
                for i in range(len(pts) - 1):
                    pt1 = fitz.Point(float(pts[i].get("x", 0)) * scale_x, float(pts[i].get("y", 0)) * scale_y)
                    pt2 = fitz.Point(float(pts[i + 1].get("x", 0)) * scale_x, float(pts[i + 1].get("y", 0)) * scale_y)
                    page.draw_line(pt1, pt2, color=color, width=2)
                applied_count += 1

        elif ann_type in ["signature", "image", "stamp"]:
            image_data = ann.get("imageData") or ann.get("image_data") or ann.get("data") or ""
            if not image_data:
                continue
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            try:
                img_bytes = base64.b64decode(image_data)
                rect = fitz.Rect(x, y, x + w, y + h)
                page.insert_image(rect, stream=img_bytes)
                applied_count += 1
        elif ann_type in ["edit_existing_text", "edited_text"] or ann.get("isExistingPdfText"):
            orig_bbox = ann.get("originalBbox") or ann.get("bbox") or [x, y, x + w, y + h]
            rect = fitz.Rect(
                float(orig_bbox[0]) * scale_x,
                float(orig_bbox[1]) * scale_y,
                float(orig_bbox[2]) * scale_x,
                float(orig_bbox[3]) * scale_y
            )
            # 1. Tutup area koordinat kata lama dengan redaction rectangle warna putih solid
            page.add_redact_annot(rect, fill=(1, 1, 1))
            page.apply_redactions()

            # 2. Tuliskan kata pengganti tepat di koordinat awal dengan ukuran font dan warna yang sesuai
            new_text = str(ann.get("newText") or ann.get("text", "")).strip()
            if new_text:
                try:
                    raw_font_size = float(ann.get("fontSize") or 12)
                except (ValueError, TypeError):
                    raw_font_size = 12.0
                font_size = max(8.0, raw_font_size * scale_y)

                is_bold = bool(ann.get("isBold"))
                is_italic = bool(ann.get("isItalic"))
                font_family = str(ann.get("fontFamily", "")).lower()

                if "times" in font_family or "serif" in font_family:
                    fontname = "tibo" if is_bold and is_italic else "tibi" if is_bold else "tiit" if is_italic else "tiro"
                elif "courier" in font_family or "mono" in font_family:
                    fontname = "cobi" if is_bold and is_italic else "cobo" if is_bold else "coit" if is_italic else "cour"
                else:
                    fontname = "hebi" if is_bold and is_italic else "hebo" if is_bold else "heit" if is_italic else "helv"

                insert_pt = fitz.Point(rect.x0, rect.y1 - 2)
                try:
                    page.insert_text(insert_pt, new_text, fontsize=font_size, color=color, fontname=fontname)
                except Exception:
                    page.insert_text(insert_pt, new_text, fontsize=font_size, color=color)
            applied_count += 1


    # 4. Hapus halaman tertentu jika diminta (mundur dari indeks tertinggi)
    if deleted_pages and len(deleted_pages) < len(doc):
        del_indices = set()
        for dp in deleted_pages:
            try:
                d_idx = int(dp) - 1
                if 0 <= d_idx < len(doc):
                    del_indices.add(d_idx)
            except Exception:
                pass
        for idx in sorted(list(del_indices), reverse=True):
            if len(doc) > 1:
                doc.delete_page(idx)

    doc.save(output_path, deflate=True, garbage=4, clean=True)
    doc.close()
    return applied_count

def search_pdf_text(input_path: str, query: str) -> list:
    """
    Mencari kemunculan teks di seluruh halaman dokumen PDF menggunakan PyMuPDF (fitz).
    Mengembalikan daftar koordinat kotak pembatas (bounding box) kata yang cocok.
    """
    import fitz

    if not query or not query.strip():
        return []

    doc = fitz.open(input_path)
    results = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        matches = page.search_for(query.strip())
        for m in matches:
            results.append({
                "page": page_idx + 1,
                "x": round(m.x0, 2),
                "y": round(m.y0, 2),
                "width": round(m.x1 - m.x0, 2),
                "height": round(m.y1 - m.y0, 2),
                "rect": [round(m.x0, 2), round(m.y0, 2), round(m.x1, 2), round(m.y1, 2)],
                "page_width": round(page.rect.width, 2),
                "page_height": round(page.rect.height, 2)
            })

    doc.close()
    return results

def replace_pdf_text(input_path: str, output_path: str, search_query: str, replace_query: str, target_pages: list = None) -> tuple[int, int]:
    """
    Mencari dan mengganti teks di dalam PDF menggunakan PyMuPDF:
    1. Tutup area koordinat kata lama dengan redaction rectangle warna putih solid
    2. Tuliskan kata pengganti tepat di koordinat awal dengan ukuran font proporsional
    """
    import fitz

    if not search_query or not search_query.strip():
        raise ValueError("Kata pencarian tidak boleh kosong.")

    doc = fitz.open(input_path)
    total_replaced = 0

    for page_idx in range(len(doc)):
        page_num = page_idx + 1
        if target_pages and page_num not in target_pages:
            continue

        page = doc[page_idx]
        matches = page.search_for(search_query.strip())
        if not matches:
            continue

        for rect in matches:
            # 1. Tutup teks lama dengan redaction putih
            page.add_redact_annot(rect, fill=(1, 1, 1))
            total_replaced += 1

        page.apply_redactions()

        # 2. Sisipkan teks pengganti
        for rect in matches:
            font_size = max(8.0, min(rect.height * 0.85, 36.0))
            insert_pt = fitz.Point(rect.x0, rect.y1 - 2)
            try:
                page.insert_text(insert_pt, replace_query, fontsize=font_size, color=(0, 0, 0), fontname="helv")
            except Exception:
                page.insert_text(insert_pt, replace_query, fontsize=font_size, color=(0, 0, 0))

    doc.save(output_path, deflate=True, garbage=4, clean=True)
    total_pages = len(doc)
    doc.close()
    return total_replaced, total_pages

def extract_pdf_text_spans(input_path: str) -> list:
    """
    Mengekstrak baris-baris teks beserta koordinat bounding box, ukuran font, dan warna
    dari seluruh halaman dokumen PDF menggunakan PyMuPDF get_text('dict').
    """
    import fitz

    doc = fitz.open(input_path)
    spans_data = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        blocks = page.get_text("dict").get("blocks", [])

        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                l_bbox = line.get("bbox", [0, 0, 0, 0])
                line_text = ""
                font_size = 12
                font_name = "helv"
                color = "#000000"

                for span in line.get("spans", []):
                    line_text += span.get("text", "")
                    if span.get("size"):
                        font_size = span.get("size")
                    if span.get("font"):
                        font_name = span.get("font")
                    c_int = span.get("color", 0)
                    if isinstance(c_int, int) and c_int != 0:
                        r = (c_int >> 16) & 255
                        g = (c_int >> 8) & 255
                        b = c_int & 255
                        color = f"#{r:02x}{g:02x}{b:02x}"

                line_text_trimmed = line_text.strip()
                if line_text_trimmed:
                    spans_data.append({
                        "id": f"span_{page_idx}_{round(l_bbox[0], 1)}_{round(l_bbox[1], 1)}",
                        "page": page_idx + 1,
                        "text": line_text,
                        "bbox": [round(l_bbox[0], 2), round(l_bbox[1], 2), round(l_bbox[2], 2), round(l_bbox[3], 2)],
                        "x": round(l_bbox[0], 2),
                        "y": round(l_bbox[1], 2),
                        "width": round(l_bbox[2] - l_bbox[0], 2),
                        "height": round(l_bbox[3] - l_bbox[1], 2),
                        "fontSize": round(font_size, 1),
                        "fontFamily": font_name,
                        "color": color,
                        "page_width": round(page.rect.width, 2),
                        "page_height": round(page.rect.height, 2)
                    })

    doc.close()
    return spans_data



