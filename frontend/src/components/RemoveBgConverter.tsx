import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  X,
  Eye,
  Sliders,
  Wand2,
  Layers,
  ClipboardCopy
} from 'lucide-react';
import { getApiUrl } from '../config/api';
import { LoadingModal } from './LoadingModal';

type CutoutMode = 'auto' | 'white_bg' | 'ai';

export const RemoveBgConverter: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [previewBg, setPreviewBg] = useState<'checkerboard' | 'dark' | 'white'>('checkerboard');
  
  // Pengaturan Canggih Chroma-Key & AI Cutout
  const [mode, setMode] = useState<CutoutMode>('auto');
  const [threshold, setThreshold] = useState<number>(240);
  const [smoothEdges, setSmoothEdges] = useState<boolean>(true);
  const [detectedType, setDetectedType] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  // Helper: Deteksi apakah sudut gambar berlatar putih solid (seperti ikon/logo vektor JPG)
  const detectWhiteBackground = (img: HTMLImageElement, cornerThreshold: number = 235): boolean => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;

      ctx.drawImage(img, 0, 0);
      const w = canvas.width;
      const h = canvas.height;

      const samplePoints = [
        [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
        [Math.floor(w / 2), 2], [Math.floor(w / 2), h - 3],
        [2, Math.floor(h / 2)], [w - 3, Math.floor(h / 2)]
      ];

      let whiteMatches = 0;
      for (const [x, y] of samplePoints) {
        const p = ctx.getImageData(x, y, 1, 1).data;
        if (p[0] >= cornerThreshold && p[1] >= cornerThreshold && p[2] >= cornerThreshold) {
          whiteMatches++;
        }
      }
      return whiteMatches >= 5;
    } catch {
      return false;
    }
  };

  // Helper: Algoritma Chroma Key / Color Thresholding presisi tinggi via Canvas
  const removeWhiteBackgroundWithCanvas = (
    imageSource: HTMLImageElement,
    colorThreshold: number = 240,
    tolerance: number = 25,
    enableSmoothing: boolean = true
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        const width = imageSource.naturalWidth || imageSource.width;
        const height = imageSource.naturalHeight || imageSource.height;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Canvas 2D context tidak tersedia di browser.'));
          return;
        }

        ctx.drawImage(imageSource, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        const softRange = enableSmoothing ? 16 : 0;
        const minThreshold = colorThreshold - softRange;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a === 0) continue;

          // Periksa apakah piksel mendekati warna putih solid (#FFFFFF)
          const isNearWhite =
            r >= colorThreshold &&
            g >= colorThreshold &&
            b >= colorThreshold &&
            Math.abs(r - g) <= tolerance &&
            Math.abs(g - b) <= tolerance;

          if (isNearWhite) {
            data[i + 3] = 0; // Transparan murni (Alpha = 0)
          } else if (enableSmoothing && r >= minThreshold && g >= minThreshold && b >= minThreshold) {
            // Anti-aliasing / kehalusan tepi siluet
            const avg = (r + g + b) / 3;
            const factor = (255 - avg) / Math.max(1, 255 - minThreshold);
            data[i + 3] = Math.min(a, Math.max(0, Math.round(factor * 255)));
          }
        }

        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Gagal mengekspor blob PNG'));
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  };

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      setAlertMessage('Format tidak didukung. Harap pilih gambar PNG, JPG, JPEG, atau WEBP.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setAlertMessage(`Ukuran file (${(file.size / (1024 * 1024)).toFixed(1)}MB) melebihi batas 25MB.`);
      return;
    }

    setSelectedFile(file);
    const previewUrl = URL.createObjectURL(file);
    setOriginalPreviewUrl(previewUrl);
    setProcessedImageUrl(null);
    setAlertMessage(null);

    // Muat gambar ke memori untuk analisis dan pemrosesan instan
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImageRef.current = img;
      processImageCutout(file, img, mode, threshold, smoothEdges);
    };
    img.src = previewUrl;
  };

  // Event Listener Paste Langsung (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const rawExt = file.type.split('/')[1] || 'png';
            const safeExt = rawExt === 'jpeg' ? 'jpg' : rawExt;
            const renamedFile = new File([file], `Pasted_Image_${Date.now()}.${safeExt}`, {
              type: file.type
            });
            handleFile(renamedFile);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [mode, threshold, smoothEdges]);

  const processImageCutout = async (
    fileToProcess: File,
    imgElement: HTMLImageElement,
    currentMode: CutoutMode,
    currentThreshold: number,
    currentSmoothing: boolean
  ) => {
    setIsProcessing(true);
    setAlertMessage(null);

    const isWhiteBg = detectWhiteBackground(imgElement);
    const isIconOrLogo = currentMode === 'white_bg' || (currentMode === 'auto' && isWhiteBg);

    if (isIconOrLogo) {
      setDetectedType('Vektor/Logo Latar Putih (Chroma Key Cutout)');
    } else {
      setDetectedType('Foto Objek / Manusia (AI Model Cutout)');
    }

    try {
      if (isIconOrLogo) {
        // Terapkan algoritma Chroma Key / Color Thresholding presisi tinggi
        const transparentBlob = await removeWhiteBackgroundWithCanvas(
          imgElement,
          currentThreshold,
          25,
          currentSmoothing
        );

        if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
        const transparentUrl = URL.createObjectURL(transparentBlob);
        setProcessedImageUrl(transparentUrl);

        // Sinkronkan ke server secara background
        const formData = new FormData();
        formData.append('file', fileToProcess);
        formData.append('mode', 'white_bg');
        formData.append('threshold', currentThreshold.toString());
        fetch(getApiUrl('/api/image/remove-bg'), { method: 'POST', body: formData }).catch(() => {});
      } else {
        // Pemrosesan AI via Backend
        const formData = new FormData();
        formData.append('file', fileToProcess);
        formData.append('mode', currentMode);
        formData.append('threshold', currentThreshold.toString());

        const response = await fetch(getApiUrl('/api/image/remove-bg'), {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ detail: 'Gagal memproses gambar di server' }));
          throw new Error(err.detail || 'Gagal menghapus latar belakang');
        }

        const blob = await response.blob();
        
        // Buat objek gambar dari respon untuk memverifikasi apakah masih berlatar putih
        const resultImg = new Image();
        resultImg.src = URL.createObjectURL(blob);
        resultImg.onload = async () => {
          if (detectWhiteBackground(resultImg)) {
            // Jika AI masih menyisakan latar putih, bersihkan dengan Chroma Key
            const refinedBlob = await removeWhiteBackgroundWithCanvas(
              resultImg,
              currentThreshold,
              25,
              currentSmoothing
            );
            if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
            setProcessedImageUrl(URL.createObjectURL(refinedBlob));
          } else {
            if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
            setProcessedImageUrl(URL.createObjectURL(blob));
          }
        };
      }
    } catch (err: any) {
      // Fallback: jalankan pembersih putih lokal jika ada kendala jaringan
      try {
        const fallbackBlob = await removeWhiteBackgroundWithCanvas(
          imgElement,
          currentThreshold,
          25,
          currentSmoothing
        );
        if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
        setProcessedImageUrl(URL.createObjectURL(fallbackBlob));
        setDetectedType('Offline Fallback (Chroma Key Cutout)');
      } catch {
        setAlertMessage(err.message || 'Terjadi kesalahan sistem saat menghapus background.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-process instan saat pengguna mengubah slider threshold atau mode
  const reprocessCurrent = (newThreshold: number, newSmoothing: boolean, newMode: CutoutMode) => {
    if (!loadedImageRef.current || !selectedFile) return;
    processImageCutout(selectedFile, loadedImageRef.current, newMode, newThreshold, newSmoothing);
  };

  const resetAll = () => {
    setSelectedFile(null);
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    setOriginalPreviewUrl(null);
    setProcessedImageUrl(null);
    setIsProcessing(false);
    setAlertMessage(null);
    setDetectedType(null);
    loadedImageRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      
      {/* Alert Error */}
      {alertMessage && (
        <div className="mb-6 p-4 bg-neo-pink border-[3px] border-black rounded-2xl shadow-neo flex items-center justify-between gap-3 text-black">
          <div className="flex items-center gap-2 text-xs font-black">
            <AlertCircle className="w-5 h-5 text-black stroke-[3] flex-shrink-0" />
            <span>{alertMessage}</span>
          </div>
          <button 
            onClick={() => setAlertMessage(null)} 
            className="p-1 bg-white border border-black rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Main Neo Card Rounded */}
      <div className="bg-white border-[3px] border-black rounded-3xl shadow-neo-lg p-6 sm:p-10 relative overflow-hidden">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-neo-pink text-black border-2 border-black rounded-full font-black uppercase text-xs px-3.5 py-1 shadow-neo-sm mb-3">
            ✨ AI & CHROMA KEY CUTOUT PRO
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-black uppercase">
            Hapus Latar Belakang
          </h2>
          <p className="mt-2 text-sm font-bold text-slate-700 max-w-xl mx-auto">
            Hilangkan latar putih pada logo/siluet vektor secara sempurna & pisahkan objek foto dengan transparansi PNG 32-bit.
          </p>
        </div>

        {/* Mode Selector Pill Buttons Rounded */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mb-8">
          <button
            type="button"
            onClick={() => {
              setMode('auto');
              if (selectedFile) reprocessCurrent(threshold, smoothEdges, 'auto');
            }}
            className={`px-4 py-2 text-xs font-black rounded-xl border-2 border-black flex items-center gap-2 transition-all cursor-pointer ${
              mode === 'auto'
                ? 'bg-neo-yellow text-black shadow-neo -translate-y-0.5'
                : 'bg-white text-slate-700 hover:bg-slate-100 shadow-neo-sm'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Auto (Deteksi Cerdas)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('white_bg');
              if (selectedFile) reprocessCurrent(threshold, smoothEdges, 'white_bg');
            }}
            className={`px-4 py-2 text-xs font-black rounded-xl border-2 border-black flex items-center gap-2 transition-all cursor-pointer ${
              mode === 'white_bg'
                ? 'bg-neo-green text-black shadow-neo -translate-y-0.5'
                : 'bg-white text-slate-700 hover:bg-slate-100 shadow-neo-sm'
            }`}
          >
            <Layers className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Hapus Latar Putih (Logo/Siluet)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('ai');
              if (selectedFile) reprocessCurrent(threshold, smoothEdges, 'ai');
            }}
            className={`px-4 py-2 text-xs font-black rounded-xl border-2 border-black flex items-center gap-2 transition-all cursor-pointer ${
              mode === 'ai'
                ? 'bg-neo-purple text-black shadow-neo -translate-y-0.5'
                : 'bg-white text-slate-700 hover:bg-slate-100 shadow-neo-sm'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>AI Neural Cutout (Foto/Manusia)</span>
          </button>
        </div>

        {/* Drop Zone Rounded */}
        {!selectedFile ? (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-dashed rounded-2xl p-8 sm:p-14 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'bg-neo-yellow border-4 border-black scale-[1.02] shadow-neo-lg ring-4 ring-black/10'
                : 'bg-[#FFFDF8] hover:bg-slate-50 border-[3px] border-black'
            }`}
          >
            <div className={`w-16 h-16 mx-auto mb-4 bg-neo-yellow border-2 border-black rounded-2xl flex items-center justify-center shadow-neo-sm ${isDragging ? 'animate-bounce' : ''}`}>
              <UploadCloud className="w-8 h-8 text-black stroke-[2.5]" />
            </div>
            <p className="text-base font-black text-black">
              {isDragging ? 'LEPAS FOTO DI SINI SEKARANG!' : (
                <>Tarik & Lepas foto ke sini, atau <span className="bg-neo-yellow px-2.5 py-1 border border-black rounded-lg underline">Pilih Foto</span></>
              )}
            </p>
            <p className="mt-2 text-xs font-bold text-slate-600">
              Mendukung PNG, JPG, JPEG, WEBP (Maksimal 25MB) • Ikon/Siluet Latar Putih Otomatis Transparan
            </p>

            {/* Paste Hint Badge */}
            <div className="mt-4 inline-flex items-center gap-1.5 bg-slate-100 border border-black rounded-lg px-3 py-1 text-xs font-black text-black shadow-neo-sm">
              <ClipboardCopy className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Bisa langsung tekan <kbd className="bg-white px-1.5 py-0.5 border border-black rounded text-[11px] font-mono">Ctrl + V</kbd> untuk Paste dari Clipboard</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => e.target.files && e.target.files[0] && handleFile(e.target.files[0])}
              accept=".png,.jpg,.jpeg,.webp"
            />
          </div>
        ) : (
          /* Before & After UI Neo-Brutalist Rounded */
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-black">File:</span>
                <span className="text-xs font-black text-black bg-neo-yellow border border-black rounded-xl px-3 py-1 shadow-neo-sm">
                  {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </span>
                {detectedType && (
                  <span className="hidden sm:inline-block text-[11px] font-black text-black bg-slate-100 border border-black rounded-lg px-2.5 py-1">
                    {detectedType}
                  </span>
                )}
              </div>
              <button
                onClick={resetAll}
                disabled={isProcessing}
                className="text-xs font-black text-black hover:text-rose-600 flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Ganti Gambar</span>
              </button>
            </div>

            {/* Grid 2 Kolom Before & After Rounded */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
              
              {/* Box Kiri: Asli */}
              <div className="bg-[#FFFDF8] border-2 border-black rounded-2xl p-4 shadow-neo-sm">
                <div className="w-full flex items-center justify-between mb-2 text-xs font-black uppercase">
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Gambar Asli</span>
                  </div>
                  <span className="bg-black text-white px-2 py-0.5 rounded-md text-[10px]">
                    BEFORE
                  </span>
                </div>
                <div className="w-full h-64 sm:h-72 border-2 border-black rounded-xl bg-white flex items-center justify-center p-2 overflow-hidden">
                  {originalPreviewUrl && (
                    <img
                      src={originalPreviewUrl}
                      alt="Original"
                      className="max-h-full max-w-full object-contain rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* Box Kanan: Hasil Tanpa Background dengan Checkerboard */}
              <div className="bg-[#FFFDF8] border-2 border-black rounded-2xl p-4 shadow-neo-sm">
                <div className="w-full flex items-center justify-between mb-2 text-xs font-black uppercase flex-wrap gap-1">
                  <div className="flex items-center gap-1.5 text-black">
                    <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Hasil Transparan</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewBg('checkerboard')}
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded border border-black transition ${
                        previewBg === 'checkerboard' ? 'bg-neo-yellow shadow-neo-sm' : 'bg-white hover:bg-slate-100'
                      }`}
                      title="Pola Papan Catur"
                    >
                      Catur
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewBg('dark')}
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded border border-black transition ${
                        previewBg === 'dark' ? 'bg-slate-900 text-white shadow-neo-sm' : 'bg-white hover:bg-slate-100'
                      }`}
                      title="Latar Gelap"
                    >
                      Gelap
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewBg('white')}
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded border border-black transition ${
                        previewBg === 'white' ? 'bg-slate-200 shadow-neo-sm' : 'bg-white hover:bg-slate-100'
                      }`}
                      title="Latar Putih"
                    >
                      Putih
                    </button>
                    <span className="bg-neo-pink text-black border border-black rounded-md px-1.5 py-0.5 text-[9px] font-black ml-1">
                      .PNG
                    </span>
                  </div>
                </div>

                <div 
                  className="w-full h-64 sm:h-72 border-2 border-black rounded-xl flex items-center justify-center p-2 relative overflow-hidden"
                  style={
                    previewBg === 'dark'
                      ? { backgroundColor: '#0f172a' }
                      : previewBg === 'white'
                      ? { backgroundColor: '#ffffff' }
                      : {
                          backgroundImage: `
                            linear-gradient(45deg, #94a3b8 25%, transparent 25%),
                            linear-gradient(-45deg, #94a3b8 25%, transparent 25%),
                            linear-gradient(45deg, transparent 75%, #94a3b8 75%),
                            linear-gradient(-45deg, transparent 75%, #94a3b8 75%)
                          `,
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                          backgroundColor: '#f8fafc'
                        }
                  }
                >
                  {isProcessing ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-center p-4 bg-white border-2 border-black rounded-xl shadow-neo-sm">
                      <Loader2 className="w-8 h-8 animate-spin text-black stroke-[3]" />
                      <p className="text-xs font-black uppercase">Menghapus Background...</p>
                      <p className="text-[11px] font-bold text-slate-600">Memotong piksel & saluran alpha</p>
                    </div>
                  ) : processedImageUrl ? (
                    <img
                      src={processedImageUrl}
                      alt="Transparent Result"
                      className="max-h-full max-w-full object-contain animate-in zoom-in-95 duration-200"
                    />
                  ) : (
                    <div className="text-xs font-black text-slate-400">Hasil akan tampil di sini</div>
                  )}
                </div>
              </div>

            </div>

            {/* Panel Pengaturan Sensitivitas Chroma Key Rounded */}
            <div className="mb-6 p-4 bg-slate-50 border-2 border-black rounded-2xl shadow-neo-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-black stroke-[2.5]" />
                  <span className="text-xs font-black uppercase text-black">
                    Sensitivitas Pemotong Latar Putih:
                  </span>
                  <span className="px-2 py-0.5 bg-neo-yellow border border-black rounded-md text-xs font-black">
                    {threshold} / 255
                  </span>
                </div>

                <div className="flex items-center gap-4 flex-1 max-w-md">
                  <input
                    type="range"
                    min="200"
                    max="255"
                    step="1"
                    value={threshold}
                    onChange={(e) => {
                      const newT = parseInt(e.target.value, 10);
                      setThreshold(newT);
                      reprocessCurrent(newT, smoothEdges, mode);
                    }}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-black"
                  />
                  
                  <label className="flex items-center gap-1.5 text-xs font-bold text-black cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={smoothEdges}
                      onChange={(e) => {
                        const newSmooth = e.target.checked;
                        setSmoothEdges(newSmooth);
                        reprocessCurrent(threshold, newSmooth, mode);
                      }}
                      className="w-4 h-4 accent-black rounded border-black"
                    />
                    <span>Haluskan Tepi</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Bottom Actions Rounded */}
            <div className="mt-6 pt-5 border-t-2 border-black flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-black text-black">
                {processedImageUrl && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    <span>Latar belakang berhasil dihilangkan (PNG Transparan 32-bit).</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={resetAll}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-5 py-2.5 bg-white border-2 border-black rounded-xl font-black text-xs shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo-sm transition-all cursor-pointer"
                >
                  Proses Foto Lain
                </button>

                {processedImageUrl && (
                  <a
                    href={processedImageUrl}
                    download={`RPDF_transparent_${selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || 'image'}.png`}
                    className="w-full sm:w-auto px-6 py-2.5 bg-neo-yellow border-2 border-black rounded-xl text-black font-black text-xs flex items-center justify-center gap-2 shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo-sm transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4 stroke-[3]" />
                    <span>UNDUH GAMBAR TRANSPARAN (.PNG)</span>
                  </a>
                )}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Neo-Brutalist Loading Modal */}
      <LoadingModal
        isOpen={isProcessing}
        title="MENGHAPUS LATAR BELAKANG..."
        customMessage="Memisahkan objek foto & membersihkan saluran alpha..."
      />
    </div>
  );
};
