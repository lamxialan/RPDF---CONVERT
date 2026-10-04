import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Type,
  PenTool,
  Image as ImageIcon,
  Square,
  MousePointer,
  Download,
  Loader2
} from 'lucide-react';
import { PdfAnnotation } from '../types';
import { SignatureModal } from './SignatureModal';
import { getApiUrl } from '../config/api';
import { addRecentActivity } from '../utils/recentActivity';

// Inisialisasi worker PDF.js CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfSignEditorProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (downloadUrl: string, fileName: string) => void;
}

type EditorTool = 'select' | 'text' | 'whiteout';

export const PdfSignEditor: React.FC<PdfSignEditorProps> = ({
  file,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active Tool & Properties
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [fontSize, setFontSize] = useState<number>(16);
  const [textColor, setTextColor] = useState<string>('#000000');

  // Annotations
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);

  // Modal Signature & File picker stamp
  const [isSigModalOpen, setIsSigModalOpen] = useState<boolean>(false);
  const stampInputRef = useRef<HTMLInputElement>(null);

  // Canvas & Overlay references
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number }>({ width: 600, height: 800 });

  // Dragging & Resizing state
  const [dragState, setDragState] = useState<{
    annId: string;
    action: 'move' | 'resize';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  // Load PDF Document
  useEffect(() => {
    if (!isOpen || !file) return;

    let isMounted = true;
    setIsLoadingPdf(true);
    setErrorMessage(null);
    setCurrentPage(1);
    setAnnotations([]);
    setSelectedAnnId(null);

    const loadPdf = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        if (!isMounted) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoadingPdf(false);
      } catch (err: any) {
        if (!isMounted) return;
        setIsLoadingPdf(false);
        setErrorMessage(`Gagal memuat dokumen PDF: ${err.message || 'Format tidak didukung'}`);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [file, isOpen]);

  // Render Page to Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      ctx.save();
      ctx.scale(dpr, dpr);

      setPageViewport({ width: viewport.width, height: viewport.height });

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      ctx.restore();
    } catch (err) {
      console.error('[PDF Render Error]', err);
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Handle overlay click to insert Text or Whiteout
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select' || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'text') {
      const newAnn: PdfAnnotation = {
        id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 5),
        page: currentPage,
        type: 'text',
        x: Math.max(10, Math.min(x - 20, pageViewport.width - 150)),
        y: Math.max(10, Math.min(y - 10, pageViewport.height - 40)),
        width: 180,
        height: 36,
        page_width: pageViewport.width,
        page_height: pageViewport.height,
        text: 'Ketik teks di sini...',
        fontSize: fontSize,
        color: textColor
      };
      setAnnotations(prev => [...prev, newAnn]);
      setSelectedAnnId(newAnn.id);
      setActiveTool('select');
    } else if (activeTool === 'whiteout') {
      const newAnn: PdfAnnotation = {
        id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 5),
        page: currentPage,
        type: 'whiteout',
        x: Math.max(10, Math.min(x - 60, pageViewport.width - 140)),
        y: Math.max(10, Math.min(y - 15, pageViewport.height - 40)),
        width: 120,
        height: 32,
        page_width: pageViewport.width,
        page_height: pageViewport.height
      };
      setAnnotations(prev => [...prev, newAnn]);
      setSelectedAnnId(newAnn.id);
      setActiveTool('select');
    }
  };

  // Add Signature from Modal
  const handleSaveSignature = (dataUrl: string) => {
    const newAnn: PdfAnnotation = {
      id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 5),
      page: currentPage,
      type: 'signature',
      x: Math.max(30, pageViewport.width / 2 - 90),
      y: Math.max(30, pageViewport.height / 2 - 45),
      width: 180,
      height: 90,
      page_width: pageViewport.width,
      page_height: pageViewport.height,
      imageData: dataUrl
    };
    setAnnotations(prev => [...prev, newAnn]);
    setSelectedAnnId(newAnn.id);
    setActiveTool('select');
  };

  // Add Stamp / Image from File Upload
  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const newAnn: PdfAnnotation = {
        id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 5),
        page: currentPage,
        type: 'image',
        x: Math.max(30, pageViewport.width / 2 - 60),
        y: Math.max(30, pageViewport.height / 2 - 60),
        width: 120,
        height: 120,
        page_width: pageViewport.width,
        page_height: pageViewport.height,
        imageData: dataUrl
      };
      setAnnotations(prev => [...prev, newAnn]);
      setSelectedAnnId(newAnn.id);
      setActiveTool('select');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Drag and Resize handlers
  const handleMouseDownItem = (e: React.MouseEvent, annId: string, action: 'move' | 'resize') => {
    e.stopPropagation();
    const targetAnn = annotations.find(a => a.id === annId);
    if (!targetAnn) return;

    setSelectedAnnId(annId);
    setDragState({
      annId,
      action,
      startX: e.clientX,
      startY: e.clientY,
      initialX: targetAnn.x,
      initialY: targetAnn.y,
      initialW: targetAnn.width,
      initialH: targetAnn.height
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    setAnnotations(prev =>
      prev.map(ann => {
        if (ann.id !== dragState.annId) return ann;

        if (dragState.action === 'move') {
          return {
            ...ann,
            x: Math.max(0, Math.min(dragState.initialX + deltaX, pageViewport.width - 20)),
            y: Math.max(0, Math.min(dragState.initialY + deltaY, pageViewport.height - 20))
          };
        } else if (dragState.action === 'resize') {
          return {
            ...ann,
            width: Math.max(30, dragState.initialW + deltaX),
            height: Math.max(20, dragState.initialH + deltaY)
          };
        }
        return ann;
      })
    );
  };

  const handleMouseUp = () => {
    if (dragState) {
      setDragState(null);
    }
  };

  // Update text content
  const handleTextChange = (id: string, text: string) => {
    setAnnotations(prev =>
      prev.map(a => (a.id === id ? { ...a, text } : a))
    );
  };

  // Delete annotation
  const handleDeleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnId === id) {
      setSelectedAnnId(null);
    }
  };

  // Save & Apply via Backend PyMuPDF
  const handleApplyAndDownload = async () => {
    if (!file || isApplying) return;

    setIsApplying(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('annotations', JSON.stringify(annotations));

      const apiUrl = getApiUrl('/api/pdf/edit-sign');
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errDetail = 'Gagal menyimpan hasil anotasi';
        try {
          const errJson = await response.json();
          errDetail = errJson.detail || errDetail;
        } catch (_) {}
        throw new Error(errDetail);
      }

      const data = await response.json();
      const downloadEndpoint = getApiUrl(data.download_url);
      const safeDownloadName = data.download_name || `${file.name.replace(/\.[^/.]+$/, '')}_signed.pdf`;

      // Simpan riwayat aktivitas lokal
      addRecentActivity({
        fileName: safeDownloadName,
        operation: 'Edit & Tanda Tangan PDF',
        downloadUrl: downloadEndpoint,
        fileSize: file.size
      });

      // Trigger browser download langsung
      const a = document.createElement('a');
      a.href = downloadEndpoint;
      a.download = safeDownloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (onSuccess) {
        onSuccess(downloadEndpoint, safeDownloadName);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat menerapkan tanda tangan ke server.');
    } finally {
      setIsApplying(false);
    }
  };

  const selectedAnn = annotations.find(a => a.id === selectedAnnId);
  const pageAnnotations = annotations.filter(a => a.page === currentPage);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Hidden file input untuk stamp/gambar */}
      <input
        type="file"
        ref={stampInputRef}
        accept="image/png,image/jpeg,image/webp"
        onChange={handleStampUpload}
        className="hidden"
      />

      {/* Signature Popup Modal */}
      <SignatureModal
        isOpen={isSigModalOpen}
        onClose={() => setIsSigModalOpen(false)}
        onSave={handleSaveSignature}
      />

      {/* Top Main Navbar */}
      <header className="h-16 bg-white dark:bg-[#181818] border-b-[3px] border-black dark:border-white px-4 flex items-center justify-between shadow-neo-sm z-20 text-black dark:text-white">
        
        {/* Title & File Info */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neo-pink border-2 border-black flex items-center justify-center text-black font-black shadow-neo-sm">
            <PenTool className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-sm sm:text-base uppercase tracking-tight">
                Editor Tanda Tangan & Anotasi
              </h2>
              <span className="bg-neo-yellow text-black border border-black text-[10px] font-black px-1.5 py-0.5 rounded shadow-neo-sm hidden sm:inline-block">
                INTERAKTIF
              </span>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-md">
              {file.name}
            </p>
          </div>
        </div>

        {/* Action Button: Apply & Download */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleApplyAndDownload}
            disabled={isApplying || isLoadingPdf}
            className={`px-4 py-2 border-[2.5px] border-black dark:border-white rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-neo transition-all ${
              isApplying || isLoadingPdf
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed border-dashed'
                : 'bg-neo-green text-black hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5'
            }`}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Terapkan & Unduh PDF</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border-2 border-black dark:border-white bg-slate-100 dark:bg-[#2A2A2A] hover:bg-neo-pink text-black dark:text-white flex items-center justify-center transition-colors shadow-neo-sm"
            title="Tutup Editor"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* Sub Header: Interactive Neo-Brutalism Tools Bar */}
      <div className="bg-[#FAF9F5] dark:bg-[#202020] border-b-2 border-black dark:border-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-black z-10 text-black dark:text-white">
        
        {/* Navigation & Zoom */}
        <div className="flex items-center gap-2">
          {/* Page Switcher */}
          <div className="flex items-center bg-white dark:bg-[#181818] border-2 border-black dark:border-white rounded-xl shadow-neo-sm overflow-hidden">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || isLoadingPdf}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4 stroke-[3]" />
            </button>
            <span className="px-3 text-xs tracking-wider font-black">
              {currentPage} / {numPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages || isLoadingPdf}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="Halaman Berikutnya"
            >
              <ChevronRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center bg-white dark:bg-[#181818] border-2 border-black dark:border-white rounded-xl shadow-neo-sm overflow-hidden">
            <button
              onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Perkecil"
            >
              <ZoomOut className="w-4 h-4 stroke-[2.5]" />
            </button>
            <span className="px-2 text-xs font-black">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Perbesar"
            >
              <ZoomIn className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Tools Palette */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          
          {/* Select Mode */}
          <button
            onClick={() => setActiveTool('select')}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all ${
              activeTool === 'select'
                ? 'bg-black text-white dark:bg-white dark:text-black shadow-neo-sm scale-105'
                : 'bg-white dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Pilih</span>
          </button>

          {/* Tambah Teks */}
          <button
            onClick={() => setActiveTool('text')}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all ${
              activeTool === 'text'
                ? 'bg-neo-yellow text-black shadow-neo-sm scale-105 ring-2 ring-black'
                : 'bg-white dark:bg-[#181818] hover:bg-neo-yellow/30'
            }`}
          >
            <Type className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Teks</span>
          </button>

          {/* Tanda Tangan */}
          <button
            onClick={() => setIsSigModalOpen(true)}
            className="px-3 py-1.5 rounded-xl border-2 border-black dark:border-white bg-neo-pink hover:bg-pink-400 text-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5 transition-all"
          >
            <PenTool className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Tanda Tangan</span>
          </button>

          {/* Stempel / Gambar */}
          <button
            onClick={() => stampInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl border-2 border-black dark:border-white bg-neo-blue hover:bg-cyan-300 text-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5 transition-all"
          >
            <ImageIcon className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Stempel / Foto</span>
          </button>

          {/* Tutup Teks (Whiteout) */}
          <button
            onClick={() => setActiveTool('whiteout')}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all ${
              activeTool === 'whiteout'
                ? 'bg-white text-black shadow-neo-sm scale-105 ring-2 ring-red-500'
                : 'bg-white dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Square className="w-3.5 h-3.5 stroke-[2.5] fill-white" />
            <span>Tutup Teks</span>
          </button>
        </div>

        {/* Selected Item Properties (Font Size / Color) */}
        {selectedAnn?.type === 'text' && (
          <div className="flex items-center gap-2 bg-white dark:bg-[#181818] border-2 border-black dark:border-white rounded-xl px-2.5 py-1 shadow-neo-sm">
            <span className="text-[10px] text-slate-500 uppercase">Font:</span>
            <select
              value={selectedAnn.fontSize || fontSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setFontSize(newSize);
                setAnnotations(prev =>
                  prev.map(a => (a.id === selectedAnn.id ? { ...a, fontSize: newSize } : a))
                );
              }}
              className="bg-transparent border border-black/30 dark:border-white/30 rounded text-xs px-1 py-0.5 font-black"
            >
              <option value={12}>12px</option>
              <option value={14}>14px</option>
              <option value={16}>16px</option>
              <option value={20}>20px</option>
              <option value={24}>24px</option>
              <option value={32}>32px</option>
            </select>

            <div className="flex items-center gap-1">
              {['#000000', '#0B3B8B', '#DC2626', '#16A34A'].map(color => (
                <button
                  key={color}
                  onClick={() => {
                    setTextColor(color);
                    setAnnotations(prev =>
                      prev.map(a => (a.id === selectedAnn.id ? { ...a, color } : a))
                    );
                  }}
                  className={`w-4 h-4 rounded-full border border-black transition-transform ${
                    (selectedAnn.color || textColor) === color ? 'scale-125 ring-1 ring-black' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Canvas Scroll Area */}
      <div className="flex-1 overflow-auto bg-slate-200 dark:bg-[#121212] p-4 sm:p-8 flex items-center justify-center relative">
        
        {isLoadingPdf && (
          <div className="flex flex-col items-center gap-3 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl p-6 shadow-neo-lg text-black dark:text-white">
            <Loader2 className="w-8 h-8 animate-spin text-neo-pink stroke-[2.5]" />
            <span className="font-black text-xs uppercase tracking-wider">
              Merender Dokumen PDF...
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-100 border-[3px] border-red-900 rounded-2xl p-6 text-red-900 max-w-md shadow-neo">
            <p className="font-black text-sm uppercase mb-2">Terjadi Kesalahan</p>
            <p className="text-xs font-bold leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* PDF Page Wrapper Container */}
        {!isLoadingPdf && !errorMessage && (
          <div
            className={`relative bg-white shadow-[12px_12px_0px_#000] dark:shadow-[12px_12px_0px_#FFF] border-[3px] border-black dark:border-white transition-transform ${
              activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            style={{
              width: pageViewport.width,
              height: pageViewport.height
            }}
          >
            {/* The Actual Rendered PDF Canvas */}
            <canvas ref={canvasRef} className="block pointer-events-none" />

            {/* Interactive Overlay Layer for Annotations */}
            <div
              ref={overlayRef}
              onClick={handleOverlayClick}
              className="absolute inset-0 z-10"
            >
              {pageAnnotations.map((ann) => {
                const isSelected = selectedAnnId === ann.id;

                return (
                  <div
                    key={ann.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnnId(ann.id);
                    }}
                    onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'move')}
                    className={`absolute group cursor-move select-none transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-black dark:ring-white border-2 border-dashed border-black/80'
                        : 'hover:ring-1 hover:ring-black/50'
                    }`}
                    style={{
                      left: ann.x,
                      top: ann.y,
                      width: ann.width,
                      height: ann.height
                    }}
                  >
                    {/* Delete Badge Button */}
                    {isSelected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(ann.id);
                        }}
                        className="absolute -top-3.5 -right-3.5 w-6 h-6 rounded-full bg-red-500 border-2 border-black text-white flex items-center justify-center font-black shadow-neo-sm z-30 hover:scale-110 transition-transform"
                        title="Hapus Objek"
                      >
                        <X className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    )}

                    {/* Content Renderer based on type */}
                    {ann.type === 'text' && (
                      <input
                        type="text"
                        value={ann.text || ''}
                        onChange={(e) => handleTextChange(ann.id, e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          fontSize: `${ann.fontSize || 16}px`,
                          color: ann.color || '#000000'
                        }}
                        className="w-full h-full bg-transparent outline-none font-bold border-none px-1 tracking-tight"
                      />
                    )}

                    {ann.type === 'whiteout' && (
                      <div className="w-full h-full bg-white shadow-sm border border-black/20" />
                    )}

                    {(ann.type === 'signature' || ann.type === 'image') && ann.imageData && (
                      <img
                        src={ann.imageData}
                        alt="Anotasi"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    )}

                    {/* Resize Handle (Bottom-Right Corner) */}
                    {isSelected && (
                      <div
                        onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize')}
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-neo-yellow border-2 border-black rounded-sm cursor-nwse-resize shadow-neo-sm z-30"
                        title="Tarik untuk mengubah ukuran"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
