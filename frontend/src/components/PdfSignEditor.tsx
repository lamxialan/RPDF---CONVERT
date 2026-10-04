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
  Trash2,
  Copy,
  Bold,
  Italic,
  Loader2
} from 'lucide-react';
import { PdfAnnotation } from '../types';
import { SignatureModal } from './SignatureModal';
import { getApiUrl } from '../config/api';
import { addRecentActivity } from '../utils/recentActivity';

// Setup worker PDF.js CDN
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
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [viewportDimensions, setViewportDimensions] = useState<{ width: number; height: number }>({ width: 600, height: 800 });

  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applyStep, setApplyStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active Tool & Properties
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [fontSize, setFontSize] = useState<number>(16);
  const [textColor, setTextColor] = useState<string>('#000000');
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);

  // Annotations stored in NATURAL PDF PAGE POINTS (Zoom-independent!)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);

  // Signature Modal & Stamp File Picker
  const [isSigModalOpen, setIsSigModalOpen] = useState<boolean>(false);
  const stampInputRef = useRef<HTMLInputElement>(null);

  // Canvas & Overlay references
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Dragging & Resizing State
  const [dragState, setDragState] = useState<{
    annId: string;
    action: 'move' | 'resize';
    handle?: 'tl' | 'tr' | 'bl' | 'br';
    startX: number;
    startY: number;
    initialNatX: number;
    initialNatY: number;
    initialNatW: number;
    initialNatH: number;
  } | null>(null);

  // Keyboard shortcut listener: Delete & Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedAnnId) return;

      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      if ((e.key === 'Delete' || (e.key === 'Backspace' && !isInputActive))) {
        e.preventDefault();
        setAnnotations(prev => prev.filter(a => a.id !== selectedAnnId));
        setSelectedAnnId(null);
      } else if (e.key === 'Escape') {
        setSelectedAnnId(null);
        setActiveTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnId]);

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
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      setNaturalDimensions({
        width: unscaledViewport.width,
        height: unscaledViewport.height
      });

      const viewport = page.getViewport({ scale });
      setViewportDimensions({
        width: viewport.width,
        height: viewport.height
      });

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

  // Click on Canvas overlay to place Text or Whiteout
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;

    // Deselect if clicking on empty space in select mode
    if (activeTool === 'select') {
      setSelectedAnnId(null);
      return;
    }

    const rect = overlayRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert Screen Pixels -> Natural PDF Points
    const natX = (screenX / viewportDimensions.width) * naturalDimensions.width;
    const natY = (screenY / viewportDimensions.height) * naturalDimensions.height;

    if (activeTool === 'text') {
      const newAnn: PdfAnnotation = {
        id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
        page: currentPage,
        type: 'text',
        x: Math.max(10, Math.min(natX - 10, naturalDimensions.width - 160)),
        y: Math.max(10, Math.min(natY - 10, naturalDimensions.height - 35)),
        width: 160,
        height: 32,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height,
        text: 'Ketik teks di sini...',
        fontSize: fontSize,
        color: textColor,
        isBold: isBold,
        isItalic: isItalic
      };
      setAnnotations(prev => [...prev, newAnn]);
      setSelectedAnnId(newAnn.id);
      setActiveTool('select');
    } else if (activeTool === 'whiteout') {
      const newAnn: PdfAnnotation = {
        id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
        page: currentPage,
        type: 'whiteout',
        x: Math.max(10, Math.min(natX - 60, naturalDimensions.width - 140)),
        y: Math.max(10, Math.min(natY - 15, naturalDimensions.height - 35)),
        width: 120,
        height: 28,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
      setAnnotations(prev => [...prev, newAnn]);
      setSelectedAnnId(newAnn.id);
      setActiveTool('select');
    }
  };

  // Add Signature from SignaturePad Modal
  const handleSaveSignature = (dataUrl: string) => {
    const defaultW = 160;
    const defaultH = 75;
    const newAnn: PdfAnnotation = {
      id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
      page: currentPage,
      type: 'signature',
      x: Math.max(20, naturalDimensions.width / 2 - defaultW / 2),
      y: Math.max(20, naturalDimensions.height / 2 - defaultH / 2),
      width: defaultW,
      height: defaultH,
      page_width: naturalDimensions.width,
      page_height: naturalDimensions.height,
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

      const size = 110;
      const newAnn: PdfAnnotation = {
        id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
        page: currentPage,
        type: 'image',
        x: Math.max(20, naturalDimensions.width / 2 - size / 2),
        y: Math.max(20, naturalDimensions.height / 2 - size / 2),
        width: size,
        height: size,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height,
        imageData: dataUrl
      };
      setAnnotations(prev => [...prev, newAnn]);
      setSelectedAnnId(newAnn.id);
      setActiveTool('select');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Duplicate an annotation (Sejda Feature)
  const handleDuplicate = (annId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const source = annotations.find(a => a.id === annId);
    if (!source) return;

    const clone: PdfAnnotation = {
      ...source,
      id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
      x: Math.min(naturalDimensions.width - source.width, source.x + 15),
      y: Math.min(naturalDimensions.height - source.height, source.y + 15)
    };
    setAnnotations(prev => [...prev, clone]);
    setSelectedAnnId(clone.id);
  };

  // Delete an annotation
  const handleDelete = (annId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAnnotations(prev => prev.filter(a => a.id !== annId));
    if (selectedAnnId === annId) {
      setSelectedAnnId(null);
    }
  };

  // Drag and Resize Handlers (with Screen -> Natural Points Conversion)
  const handleMouseDownItem = (e: React.MouseEvent, annId: string, action: 'move' | 'resize', handle?: 'tl' | 'tr' | 'bl' | 'br') => {
    e.stopPropagation();
    const target = annotations.find(a => a.id === annId);
    if (!target) return;

    setSelectedAnnId(annId);
    setDragState({
      annId,
      action,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialNatX: target.x,
      initialNatY: target.y,
      initialNatW: target.width,
      initialNatH: target.height
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;

    // Delta in screen pixels
    const deltaScreenX = e.clientX - dragState.startX;
    const deltaScreenY = e.clientY - dragState.startY;

    // Convert Delta Screen -> Delta Natural Points
    const scaleFactorX = naturalDimensions.width / viewportDimensions.width;
    const scaleFactorY = naturalDimensions.height / viewportDimensions.height;
    const deltaNatX = deltaScreenX * scaleFactorX;
    const deltaNatY = deltaScreenY * scaleFactorY;

    setAnnotations(prev =>
      prev.map(ann => {
        if (ann.id !== dragState.annId) return ann;

        if (dragState.action === 'move') {
          return {
            ...ann,
            x: Math.max(0, Math.min(dragState.initialNatX + deltaNatX, naturalDimensions.width - 20)),
            y: Math.max(0, Math.min(dragState.initialNatY + deltaNatY, naturalDimensions.height - 20))
          };
        } else if (dragState.action === 'resize') {
          const handle = dragState.handle || 'br';
          let newW = dragState.initialNatW;
          let newH = dragState.initialNatH;
          let newX = dragState.initialNatX;
          let newY = dragState.initialNatY;

          if (handle === 'br') {
            newW = Math.max(25, dragState.initialNatW + deltaNatX);
            newH = Math.max(16, dragState.initialNatH + deltaNatY);
          } else if (handle === 'bl') {
            newW = Math.max(25, dragState.initialNatW - deltaNatX);
            newH = Math.max(16, dragState.initialNatH + deltaNatY);
            newX = dragState.initialNatX + (dragState.initialNatW - newW);
          } else if (handle === 'tr') {
            newW = Math.max(25, dragState.initialNatW + deltaNatX);
            newH = Math.max(16, dragState.initialNatH - deltaNatY);
            newY = dragState.initialNatY + (dragState.initialNatH - newH);
          } else if (handle === 'tl') {
            newW = Math.max(25, dragState.initialNatW - deltaNatX);
            newH = Math.max(16, dragState.initialNatH - deltaNatY);
            newX = dragState.initialNatX + (dragState.initialNatW - newW);
            newY = dragState.initialNatY + (dragState.initialNatH - newH);
          }

          return {
            ...ann,
            x: Math.max(0, newX),
            y: Math.max(0, newY),
            width: newW,
            height: newH
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

  // Update text item content
  const handleTextChange = (id: string, text: string) => {
    setAnnotations(prev =>
      prev.map(a => (a.id === id ? { ...a, text } : a))
    );
  };

  // Save & Apply via Backend PyMuPDF
  const handleApplyAndDownload = async () => {
    if (!file || isApplying) return;

    setIsApplying(true);
    setErrorMessage(null);
    setApplyStep('Memproses lembar dokumen...');

    try {
      await new Promise(r => setTimeout(r, 400));
      setApplyStep('Menerapkan anotasi dengan PyMuPDF...');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('annotations', JSON.stringify(annotations));

      // Try /api/pdf/apply-annotations with fallback to /api/pdf/edit-sign
      let response = await fetch(getApiUrl('/api/pdf/apply-annotations'), {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        response = await fetch(getApiUrl('/api/pdf/edit-sign'), {
          method: 'POST',
          body: formData
        });
      }

      if (!response.ok) {
        let errDetail = 'Gagal memproses anotasi dokumen';
        try {
          const errJson = await response.json();
          errDetail = errJson.detail || errDetail;
        } catch (_) {}
        throw new Error(errDetail);
      }

      setApplyStep('Selesai! Mengunduh dokumen...');
      await new Promise(r => setTimeout(r, 400));

      const data = await response.json();
      const downloadEndpoint = getApiUrl(data.download_url);
      const safeDownloadName = data.download_name || `${file.name.replace(/\.[^/.]+$/, '')}_signed.pdf`;

      // Simpan riwayat unduhan lokal
      addRecentActivity({
        fileName: safeDownloadName,
        operation: 'Edit & Tanda Tangan PDF',
        downloadUrl: downloadEndpoint,
        fileSize: file.size
      });

      // Browser automatic download
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
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat menyimpan dokumen.');
    } finally {
      setIsApplying(false);
      setApplyStep('');
    }
  };

  const selectedAnn = annotations.find(a => a.id === selectedAnnId);
  const pageAnnotations = annotations.filter(a => a.page === currentPage);
  const totalAnnotationsCount = annotations.length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-hidden text-black dark:text-white"
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

      {/* Signature 3-Tab Modal */}
      <SignatureModal
        isOpen={isSigModalOpen}
        onClose={() => setIsSigModalOpen(false)}
        onSave={handleSaveSignature}
      />

      {/* TOP MAIN HEADER (Neo-Brutalism) */}
      <header className="h-16 bg-white dark:bg-[#181818] border-b-[3px] border-black dark:border-white px-4 flex items-center justify-between shadow-neo-sm z-20">
        
        {/* Title & Document Badge */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neo-pink border-2 border-black flex items-center justify-center text-black font-black shadow-neo-sm">
            <PenTool className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-sm sm:text-base uppercase tracking-tight">
                Editor PDF Sejda-Style
              </h2>
              <span className="bg-neo-yellow text-black border border-black text-[10px] font-black px-2 py-0.5 rounded shadow-neo-sm">
                INTERAKTIF
              </span>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-md">
              {file.name} • {totalAnnotationsCount} objek terpasang
            </p>
          </div>
        </div>

        {/* Action Button: Apply & Download */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleApplyAndDownload}
            disabled={isApplying || isLoadingPdf}
            className={`px-5 py-2.5 border-[2.5px] border-black dark:border-white rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-neo transition-all cursor-pointer ${
              isApplying || isLoadingPdf
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed border-dashed'
                : 'bg-neo-green text-black hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5'
            }`}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>{applyStep || 'Memproses PDF...'}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>TERAPKAN & UNDUH PDF</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border-2 border-black dark:border-white bg-slate-100 dark:bg-[#2A2A2A] hover:bg-neo-pink text-black dark:text-white flex items-center justify-center transition-colors shadow-neo-sm cursor-pointer"
            title="Tutup Editor"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* SUB-TOOLBAR: INTERACTIVE TOOLS & CONTROLS */}
      <div className="bg-[#FAF9F5] dark:bg-[#202020] border-b-2 border-black dark:border-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-black z-10">
        
        {/* Navigation & Zoom */}
        <div className="flex items-center gap-2">
          {/* Page Switcher */}
          <div className="flex items-center bg-white dark:bg-[#181818] border-2 border-black dark:border-white rounded-xl shadow-neo-sm overflow-hidden">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || isLoadingPdf}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4 stroke-[3]" />
            </button>
            <span className="px-3 text-xs tracking-wider font-black">
              Hal {currentPage} dari {numPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages || isLoadingPdf}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              title="Halaman Berikutnya"
            >
              <ChevronRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center bg-white dark:bg-[#181818] border-2 border-black dark:border-white rounded-xl shadow-neo-sm overflow-hidden">
            <button
              onClick={() => setScale(s => Math.max(0.6, Number((s - 0.2).toFixed(1))))}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Perkecil (-)"
            >
              <ZoomOut className="w-4 h-4 stroke-[2.5]" />
            </button>
            <span className="px-2 text-xs font-black">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.min(2.5, Number((s + 0.2).toFixed(1))))}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Perbesar (+)"
            >
              <ZoomIn className="w-4 h-4 stroke-[2.5]" />
            </button>
            <button
              onClick={() => setScale(1.0)}
              className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 border-l border-black/20 dark:border-white/20 text-[10px] uppercase font-black cursor-pointer"
              title="Reset Zoom 100%"
            >
              100%
            </button>
          </div>
        </div>

        {/* Tools Palette */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Select Mode */}
          <button
            onClick={() => setActiveTool('select')}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTool === 'text'
                ? 'bg-neo-yellow text-black shadow-neo-sm scale-105 ring-2 ring-black'
                : 'bg-white dark:bg-[#181818] hover:bg-neo-yellow/30'
            }`}
          >
            <Type className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Teks Baru</span>
          </button>

          {/* Tanda Tangan */}
          <button
            onClick={() => setIsSigModalOpen(true)}
            className="px-3 py-1.5 rounded-xl border-2 border-black dark:border-white bg-neo-pink hover:bg-pink-400 text-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <PenTool className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Tanda Tangan</span>
          </button>

          {/* Stempel / Gambar */}
          <button
            onClick={() => stampInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl border-2 border-black dark:border-white bg-neo-blue hover:bg-cyan-300 text-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Stempel / Foto</span>
          </button>

          {/* Tutup Teks (Whiteout) */}
          <button
            onClick={() => setActiveTool('whiteout')}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTool === 'whiteout'
                ? 'bg-white text-black shadow-neo-sm scale-105 ring-2 ring-rose-500'
                : 'bg-white dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Square className="w-3.5 h-3.5 stroke-[2.5] fill-white" />
            <span>Tutup Teks (Whiteout)</span>
          </button>
        </div>

        {/* Selected Item Properties Bar (Font Size, Bold, Italic, Color) */}
        {selectedAnn?.type === 'text' && (
          <div className="flex items-center gap-2 bg-white dark:bg-[#181818] border-2 border-black dark:border-white rounded-xl px-3 py-1 shadow-neo-sm">
            {/* Font Size */}
            <span className="text-[10px] text-slate-500 uppercase">Ukuran:</span>
            <select
              value={selectedAnn.fontSize || fontSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setFontSize(newSize);
                setAnnotations(prev =>
                  prev.map(a => (a.id === selectedAnn.id ? { ...a, fontSize: newSize } : a))
                );
              }}
              className="bg-transparent border border-black/30 dark:border-white/30 rounded text-xs px-1.5 py-0.5 font-black cursor-pointer"
            >
              {[12, 14, 16, 20, 24, 32].map(s => (
                <option key={s} value={s} className="text-black">{s} pt</option>
              ))}
            </select>

            {/* Bold Toggle */}
            <button
              onClick={() => {
                const nextBold = !(selectedAnn.isBold ?? isBold);
                setIsBold(nextBold);
                setAnnotations(prev =>
                  prev.map(a => (a.id === selectedAnn.id ? { ...a, isBold: nextBold } : a))
                );
              }}
              className={`p-1 border border-black dark:border-white rounded cursor-pointer transition-colors ${
                (selectedAnn.isBold ?? isBold) ? 'bg-neo-yellow text-black' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Tebal (Bold)"
            >
              <Bold className="w-3.5 h-3.5 stroke-[3]" />
            </button>

            {/* Italic Toggle */}
            <button
              onClick={() => {
                const nextItalic = !(selectedAnn.isItalic ?? isItalic);
                setIsItalic(nextItalic);
                setAnnotations(prev =>
                  prev.map(a => (a.id === selectedAnn.id ? { ...a, isItalic: nextItalic } : a))
                );
              }}
              className={`p-1 border border-black dark:border-white rounded cursor-pointer transition-colors ${
                (selectedAnn.isItalic ?? isItalic) ? 'bg-neo-yellow text-black' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Miring (Italic)"
            >
              <Italic className="w-3.5 h-3.5 stroke-[3]" />
            </button>

            {/* Color Swatches */}
            <div className="flex items-center gap-1 ml-1">
              {[
                { label: 'Hitam', value: '#000000' },
                { label: 'Merah', value: '#DC2626' },
                { label: 'Biru', value: '#0B3B8B' },
                { label: 'Hijau', value: '#16A34A' },
                { label: 'Putih', value: '#FFFFFF' }
              ].map(c => (
                <button
                  key={c.value}
                  onClick={() => {
                    setTextColor(c.value);
                    setAnnotations(prev =>
                      prev.map(a => (a.id === selectedAnn.id ? { ...a, color: c.value } : a))
                    );
                  }}
                  className={`w-4 h-4 rounded-full border border-black transition-transform cursor-pointer ${
                    (selectedAnn.color || textColor) === c.value ? 'scale-125 ring-2 ring-black dark:ring-white' : ''
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MAIN DOCUMENT CANVAS AREA */}
      <div className="flex-1 overflow-auto bg-slate-200 dark:bg-[#121212] p-4 sm:p-8 flex items-center justify-center relative">
        
        {/* Loading PDF */}
        {isLoadingPdf && (
          <div className="flex flex-col items-center gap-3 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl p-6 shadow-neo-lg text-black dark:text-white">
            <Loader2 className="w-8 h-8 animate-spin text-neo-pink stroke-[2.5]" />
            <span className="font-black text-xs uppercase tracking-wider">
              Merender Dokumen PDF...
            </span>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="bg-red-100 border-[3px] border-red-900 rounded-2xl p-6 text-red-900 max-w-md shadow-neo">
            <p className="font-black text-sm uppercase mb-2">Terjadi Kesalahan</p>
            <p className="text-xs font-bold leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* PDF Page Wrapper Container */}
        {!isLoadingPdf && !errorMessage && (
          <div
            className={`relative bg-white shadow-[12px_12px_0px_#000] dark:shadow-[12px_12px_0px_#FFF] border-[3px] border-black dark:border-white transition-all ${
              activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            style={{
              width: viewportDimensions.width,
              height: viewportDimensions.height
            }}
          >
            {/* The Actual Rendered PDF Canvas */}
            <canvas ref={canvasRef} className="block pointer-events-none" />

            {/* Interactive Overlay Layer for Annotations */}
            <div
              ref={overlayRef}
              onClick={handleOverlayClick}
              className="absolute inset-0 z-10 overflow-hidden"
            >
              {pageAnnotations.map((ann) => {
                const isSelected = selectedAnnId === ann.id;

                // Relative calculation: Natural Points -> Screen Pixels
                const screenX = (ann.x / naturalDimensions.width) * viewportDimensions.width;
                const screenY = (ann.y / naturalDimensions.height) * viewportDimensions.height;
                const screenW = (ann.width / naturalDimensions.width) * viewportDimensions.width;
                const screenH = (ann.height / naturalDimensions.height) * viewportDimensions.height;

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
                        : 'hover:ring-1 hover:ring-black/60'
                    }`}
                    style={{
                      left: screenX,
                      top: screenY,
                      width: screenW,
                      height: screenH
                    }}
                  >
                    {/* FLOATING ACTION TOOLBAR (SEJDA STYLE: DUPLICATE & TRASH) */}
                    {isSelected && (
                      <div
                        className="absolute -top-10 left-0 bg-white dark:bg-[#1E1E1E] border-2 border-black dark:border-white rounded-xl shadow-neo-sm px-1.5 py-0.5 flex items-center gap-1 z-40 text-black dark:text-white animate-in fade-in duration-100"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleDuplicate(ann.id, e)}
                          className="p-1 hover:bg-neo-yellow hover:text-black rounded transition-colors cursor-pointer"
                          title="Duplikasi Objek"
                        >
                          <Copy className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleDelete(ann.id, e)}
                          className="p-1 hover:bg-rose-500 hover:text-white rounded transition-colors cursor-pointer text-red-600"
                          title="Hapus Objek (Delete / Backspace)"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>
                    )}

                    {/* CONTENT RENDERER BASED ON TYPE */}

                    {/* Type 1: Text */}
                    {ann.type === 'text' && (
                      <input
                        type="text"
                        value={ann.text || ''}
                        onChange={(e) => handleTextChange(ann.id, e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          fontSize: `${((ann.fontSize || 16) * scale)}px`,
                          color: ann.color || '#000000',
                          fontWeight: ann.isBold ? 800 : 500,
                          fontStyle: ann.isItalic ? 'italic' : 'normal'
                        }}
                        className="w-full h-full bg-transparent outline-none border-none px-1 tracking-tight"
                      />
                    )}

                    {/* Type 2: Whiteout Box */}
                    {ann.type === 'whiteout' && (
                      <div className="w-full h-full bg-white shadow-sm border border-slate-300" />
                    )}

                    {/* Type 3: Signature or Image Stamp */}
                    {(ann.type === 'signature' || ann.type === 'image') && ann.imageData && (
                      <img
                        src={ann.imageData}
                        alt="Anotasi"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    )}

                    {/* 4-CORNER RESIZE HANDLES (SEJDA STYLE) */}
                    {isSelected && (
                      <>
                        {/* Top-Left */}
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'tl')}
                          className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-neo-yellow border-2 border-black rounded-sm cursor-nwse-resize shadow-neo-sm z-30"
                        />
                        {/* Top-Right */}
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'tr')}
                          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-neo-yellow border-2 border-black rounded-sm cursor-nesw-resize shadow-neo-sm z-30"
                        />
                        {/* Bottom-Left */}
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'bl')}
                          className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-neo-yellow border-2 border-black rounded-sm cursor-nesw-resize shadow-neo-sm z-30"
                        />
                        {/* Bottom-Right */}
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'br')}
                          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-neo-yellow border-2 border-black rounded-sm cursor-nwse-resize shadow-neo-sm z-30"
                        />
                      </>
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
