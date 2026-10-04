# RPDF - High-Performance Multi-File, Document & AI Cutout Converter

Aplikasi konverter dokumen, gambar, dan AI tools multifungsi tingkat lanjut berbasis web dengan arsitektur modern (React/Vite + Tailwind CSS + Node.js / FastAPI).

## 🚀 Fitur Unggulan RPDF

1. **Hapus Latar Belakang (AI Remove Background):**
   - Hapus background foto otomatis berbasis AI lokal (`rembg` / U2-Net ONNX).
   - Tampilan interaktif **Before & After Preview** dengan efek *checkerboard* transparan.
   - Unduh hasil dalam format PNG 32-bit dengan saluran alfa (transparansi utuh).
2. **Konverter Dokumen Terdedikasi:**
   - PDF ➔ DOCX (Dengan patch Google Docs anti broken image), PDF ➔ XLSX, PDF ➔ PPTX, TXT ➔ PDF.
   - DOCX, XLSX, PPTX ➔ PDF.
   - Menolak file gambar secara otomatis dengan notifikasi pemindahan tab.
3. **Konverter Gambar Terdedikasi:**
   - PNG, JPG, JPEG, WEBP, HEIC, SVG ➔ Antar format gambar atau **Dokumen PDF**.
4. **Utilitas Dokumen PDF:**
   - **Merge PDF:** Menggabungkan beberapa file PDF menjadi 1 file.
   - **Compress PDF:** Memperkecil ukuran PDF tanpa mengurangi ketajaman teks.
5. **Multi-File Batching & ZIP Downloader:**
   - Drag & drop banyak file sekaligus dan unduh semua hasil dalam satu file `.zip`.
6. **Keamanan & Storage Management:**
   - Validasi file (Maksimal 25MB per file).
   - Validasi Magic Bytes biner.
   - Daemon auto-cleanup menghapus file sementara yang berusia > 1 jam (TTL).

---

## ⚡ Cara Menjalankan

Aplikasi berjalan di dua port:
- **Frontend UI (RPDF):** `http://localhost:5173`
- **Backend API:** `http://localhost:8000`

```powershell
# Menjalankan Backend (Node.js Native):
cd backend
node server.mjs

# Menjalankan Frontend (React + Vite):
cd frontend
npm run dev
```

### Opsi Backend AI Python (rembg):
```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
