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
  Loader2,
  RotateCw,
  RotateCcw,
  Plus,
  Link,
  CheckSquare,
  Highlighter,
  Shapes,
  Circle,
  Minus,
  Undo2,
  Redo2
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

type EditorTool =
  | 'select'
  | 'text'
  | 'whiteout'
  | 'highlight'
  | 'rect'
  | 'circle'
  | 'line'
  | 'link'
  | 'form';

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
  const [activeTool, setActiveTool] = useState<EditorTool>('text');
  const [fontSize, setFontSize] = useState<number>(14);
  const [textColor, setTextColor] = useState<string>('#000000');
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState<boolean>(false);

  // Per-page modifications state
  const [deletedPages, setDeletedPages] = useState<number[]>([]);
  const [pageRotations, setPageRotations] = useState<{ [page: number]: number }>({});
  const [insertedPages, setInsertedPages] = useState<number[]>([]);

  // Annotations History (Undo / Redo stack)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [history, setHistory] = useState<PdfAnnotation[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
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

  // Record undo/redo history helper
  const pushHistory = useCallback((newAnnotations: PdfAnnotation[]) => {
    setHistory(prev => {
      const upToCurrent = prev.slice(0, historyIndex + 1);
      return [...upToCurrent, newAnnotations];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setAnnotations(history[prevIndex]);
      setSelectedAnnId(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setAnnotations(history[nextIndex]);
      setSelectedAnnId(null);
    }
  };

  // Keyboard shortcut listener: Delete, Backspace, Ctrl+Z, Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (!selectedAnnId) return;

      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      if (e.key === 'Delete' || (e.key === 'Backspace' && !isInputActive)) {
        e.preventDefault();
        const updated = annotations.filter(a => a.id !== selectedAnnId);
        setAnnotations(updated);
        pushHistory(updated);
        setSelectedAnnId(null);
      } else if (e.key === 'Escape') {
        setSelectedAnnId(null);
        setActiveTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnId, annotations, history, historyIndex, pushHistory]);

  // Load PDF Document
  useEffect(() => {
    if (!isOpen || !file) return;

    let isMounted = true;
    setIsLoadingPdf(true);
    setErrorMessage(null);
    setCurrentPage(1);
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedAnnId(null);
    setDeletedPages([]);
    setPageRotations({});
    setInsertedPages([]);

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

      // Include custom page rotation if any
      const pageRot = (pageRotations[currentPage] || 0) % 360;
      const viewport = page.getViewport({ scale, rotation: pageRot });

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
  }, [pdfDoc, currentPage, scale, pageRotations]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Click on Canvas overlay to place new annotations
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

    let newAnn: PdfAnnotation | null = null;
    const id = 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6);

    if (activeTool === 'text') {
      // Sejda Text Box: clean, minimal, auto-expanding
      newAnn = {
        id,
        page: currentPage,
        type: 'text',
        x: Math.max(5, Math.min(natX, naturalDimensions.width - 120)),
        y: Math.max(5, Math.min(natY - 8, naturalDimensions.height - 30)),
        width: 140,
        height: 28,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height,
        text: '', // Empty text so placeholder "Type your text" appears naturally
        fontSize: fontSize,
        color: textColor,
        isBold: isBold,
        isItalic: isItalic
      };
    } else if (activeTool === 'whiteout') {
      newAnn = {
        id,
        page: currentPage,
        type: 'whiteout',
        x: Math.max(5, Math.min(natX - 50, naturalDimensions.width - 110)),
        y: Math.max(5, Math.min(natY - 12, naturalDimensions.height - 28)),
        width: 110,
        height: 26,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    } else if (activeTool === 'highlight') {
      newAnn = {
        id,
        page: currentPage,
        type: 'highlight',
        x: Math.max(5, Math.min(natX - 50, naturalDimensions.width - 120)),
        y: Math.max(5, Math.min(natY - 10, naturalDimensions.height - 24)),
        width: 120,
        height: 20,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    } else if (activeTool === 'rect') {
      newAnn = {
        id,
        page: currentPage,
        type: 'rect',
        x: Math.max(5, natX - 40),
        y: Math.max(5, natY - 30),
        width: 80,
        height: 60,
        color: textColor,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    } else if (activeTool === 'circle') {
      newAnn = {
        id,
        page: currentPage,
        type: 'circle',
        x: Math.max(5, natX - 35),
        y: Math.max(5, natY - 35),
        width: 70,
        height: 70,
        color: textColor,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    } else if (activeTool === 'line') {
      newAnn = {
        id,
        page: currentPage,
        type: 'line',
        x: Math.max(5, natX - 50),
        y: Math.max(5, natY),
        width: 100,
        height: 2,
        color: textColor,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    } else if (activeTool === 'link') {
      const url = window.prompt('Masukkan alamat URL tautan (Hyperlink):', 'https://');
      if (url) {
        newAnn = {
          id,
          page: currentPage,
          type: 'link',
          x: Math.max(5, natX - 40),
          y: Math.max(5, natY - 12),
          width: 80,
          height: 24,
          url: url,
          page_width: naturalDimensions.width,
          page_height: naturalDimensions.height
        };
      }
    } else if (activeTool === 'form') {
      newAnn = {
        id,
        page: currentPage,
        type: 'form',
        x: Math.max(5, natX - 10),
        y: Math.max(5, natY - 10),
        width: 20,
        height: 20,
        checked: false,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    }

    if (newAnn) {
      const updated = [...annotations, newAnn];
      setAnnotations(updated);
      pushHistory(updated);
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
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    pushHistory(updated);
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
      const updated = [...annotations, newAnn];
      setAnnotations(updated);
      pushHistory(updated);
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
    const updated = [...annotations, clone];
    setAnnotations(updated);
    pushHistory(updated);
    setSelectedAnnId(clone.id);
  };

  // Delete an annotation
  const handleDelete = (annId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = annotations.filter(a => a.id !== annId);
    setAnnotations(updated);
    pushHistory(updated);
    if (selectedAnnId === annId) {
      setSelectedAnnId(null);
    }
  };

  // Per-page actions (Rotate, Insert, Delete)
  const handleRotatePage = (direction: 'cw' | 'ccw') => {
    const currentRot = pageRotations[currentPage] || 0;
    const delta = direction === 'cw' ? 90 : -90;
    const newRot = (currentRot + delta + 360) % 360;
    setPageRotations(prev => ({ ...prev, [currentPage]: newRot }));
  };

  const handleDeletePage = () => {
    if (numPages <= 1) {
      alert('Dokumen PDF harus memiliki minimal 1 halaman.');
      return;
    }
    if (window.confirm(`Hapus halaman ${currentPage} dari dokumen?`)) {
      setDeletedPages(prev => [...new Set([...prev, currentPage])]);
      // Remove annotations on this page
      const updated = annotations.filter(a => a.page !== currentPage);
      setAnnotations(updated);
      pushHistory(updated);
      setCurrentPage(p => Math.max(1, Math.min(numPages - 1, p)));
    }
  };

  const handleInsertPage = () => {
    setInsertedPages(prev => [...prev, currentPage]);
    alert(`Halaman kosong baru telah disisipkan setelah halaman ${currentPage}.`);
  };

  // Drag and Resize Handlers
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

    const deltaScreenX = e.clientX - dragState.startX;
    const deltaScreenY = e.clientY - dragState.startY;

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
      pushHistory(annotations);
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

      const payload = {
        annotations: annotations,
        deleted_pages: deletedPages,
        page_rotations: pageRotations,
        insert_pages: insertedPages
      };

      const formData = new FormData();
      formData.append('file', file);
      formData.append('annotations', JSON.stringify(payload));

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

      addRecentActivity({
        fileName: safeDownloadName,
        operation: 'Edit & Tanda Tangan PDF',
        downloadUrl: downloadEndpoint,
        fileSize: file.size
      });

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

      {/* TOP HEADER: Clean Neo-Brutalist Branding & Close */}
      <header className="h-14 bg-white dark:bg-[#181818] border-b-[3px] border-black dark:border-white px-4 flex items-center justify-between shadow-neo-sm z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-neo-pink border-2 border-black flex items-center justify-center text-black font-black shadow-neo-sm">
            <PenTool className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="font-black text-sm sm:text-base uppercase tracking-tight flex items-center gap-2">
              <span>Sejda PDF Editor Pro</span>
              <span className="bg-neo-yellow text-black border border-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-neo-sm hidden sm:inline-block">
                v2.0
              </span>
            </h2>
            <p className="text-[10px] font-bold text-slate-500 truncate max-w-xs sm:max-w-md">
              {file.name} • {totalAnnotationsCount} objek terpasang
            </p>
          </div>
        </div>

        {/* Undo, Redo, and Close button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-[#252525] border-2 border-black dark:border-white rounded-xl p-0.5 shadow-neo-sm">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 rounded-lg transition cursor-pointer"
              title="Batalkan (Undo - Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4 stroke-[2.5]" />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 rounded-lg transition cursor-pointer"
              title="Ulangi (Redo - Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl border-2 border-black dark:border-white bg-slate-100 dark:bg-[#2A2A2A] hover:bg-neo-pink flex items-center justify-center transition-colors shadow-neo-sm cursor-pointer"
            title="Tutup Editor"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* SEJDA MAIN TOOLBAR: Full Suite of Tools */}
      <div className="bg-[#FAF9F5] dark:bg-[#202020] border-b-2 border-black dark:border-white px-4 py-2 flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap text-xs font-black z-20">
        
        {/* 1. Text */}
        <button
          onClick={() => setActiveTool('text')}
          className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTool === 'text'
              ? 'bg-neo-yellow text-black shadow-neo-sm scale-105 ring-2 ring-black'
              : 'bg-white dark:bg-[#181818] hover:bg-neo-yellow/30'
          }`}
          title="Tambah Teks (Klik di sembarang area dokumen)"
        >
          <Type className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Text</span>
        </button>

        {/* 2. Links */}
        <button
          onClick={() => setActiveTool('link')}
          className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTool === 'link'
              ? 'bg-neo-blue text-black shadow-neo-sm scale-105 ring-2 ring-black'
              : 'bg-white dark:bg-[#181818] hover:bg-neo-blue/30'
          }`}
          title="Sisipkan Tautan Hyperlink"
        >
          <Link className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Links</span>
        </button>

        {/* 3. Forms */}
        <button
          onClick={() => setActiveTool('form')}
          className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTool === 'form'
              ? 'bg-emerald-300 text-black shadow-neo-sm scale-105 ring-2 ring-black'
              : 'bg-white dark:bg-[#181818] hover:bg-emerald-100'
          }`}
          title="Sisipkan Kotak Form / Checkbox"
        >
          <CheckSquare className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Forms</span>
        </button>

        {/* 4. Images */}
        <button
          onClick={() => stampInputRef.current?.click()}
          className="px-3 py-1.5 rounded-xl border-2 border-black dark:border-white bg-white dark:bg-[#181818] hover:bg-slate-100 text-black dark:text-white uppercase flex items-center gap-1.5 shadow-neo-sm cursor-pointer"
          title="Sisipkan Gambar, Logo, atau Materai"
        >
          <ImageIcon className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Images</span>
        </button>

        {/* 5. Sign */}
        <button
          onClick={() => setIsSigModalOpen(true)}
          className="px-3 py-1.5 rounded-xl border-2 border-black dark:border-white bg-neo-pink hover:bg-pink-400 text-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          title="Tanda Tangan Digital (Gambar, Ketik, atau Unggah)"
        >
          <PenTool className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Sign</span>
        </button>

        {/* 6. Whiteout */}
        <button
          onClick={() => setActiveTool('whiteout')}
          className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTool === 'whiteout'
              ? 'bg-white text-black shadow-neo-sm scale-105 ring-2 ring-rose-500'
              : 'bg-white dark:bg-[#181818] hover:bg-slate-100'
          }`}
          title="Tutup Teks Lama (Whiteout Opaque Box)"
        >
          <Square className="w-3.5 h-3.5 stroke-[2.5] fill-white" />
          <span>Whiteout</span>
        </button>

        {/* 7. Annotate / Highlight */}
        <button
          onClick={() => setActiveTool('highlight')}
          className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTool === 'highlight'
              ? 'bg-amber-300 text-black shadow-neo-sm scale-105 ring-2 ring-black'
              : 'bg-white dark:bg-[#181818] hover:bg-amber-100'
          }`}
          title="Highlight / Stabilo Teks"
        >
          <Highlighter className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Annotate</span>
        </button>

        {/* 8. Shapes Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShapeMenuOpen(!shapeMenuOpen)}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              ['rect', 'circle', 'line'].includes(activeTool)
                ? 'bg-purple-300 text-black shadow-neo-sm scale-105 ring-2 ring-black'
                : 'bg-white dark:bg-[#181818] hover:bg-purple-100'
            }`}
            title="Bentuk (Kotak, Lingkaran, Garis)"
          >
            <Shapes className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Shapes</span>
          </button>

          {shapeMenuOpen && (
            <div className="absolute top-full mt-1.5 left-0 bg-white dark:bg-[#1E1E1E] border-2 border-black dark:border-white rounded-xl shadow-neo p-1.5 z-40 flex flex-col gap-1 w-32">
              <button
                onClick={() => { setActiveTool('rect'); setShapeMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Kotak</span>
              </button>
              <button
                onClick={() => { setActiveTool('circle'); setShapeMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left"
              >
                <Circle className="w-3.5 h-3.5" />
                <span>Lingkaran</span>
              </button>
              <button
                onClick={() => { setActiveTool('line'); setShapeMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Garis</span>
              </button>
            </div>
          )}
        </div>

        {/* Pointer / Deselect */}
        <button
          onClick={() => setActiveTool('select')}
          className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTool === 'select'
              ? 'bg-black text-white dark:bg-white dark:text-black shadow-neo-sm'
              : 'bg-white dark:bg-[#181818] hover:bg-slate-100'
          }`}
          title="Mode Kursor / Pilih Objek"
        >
          <MousePointer className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Pilih</span>
        </button>

      </div>

      {/* MAIN DOCUMENT VIEWPORT WITH SEJDA PER-PAGE CONTROLS */}
      <div className="flex-1 overflow-auto bg-slate-200 dark:bg-[#121212] p-4 sm:p-8 flex flex-col items-center relative">
        
        {/* PER-PAGE BAR DIRECTLY ATOP THE CURRENT PDF PAGE */}
        <div className="mb-3 flex items-center justify-between gap-3 bg-white dark:bg-[#1E1E1E] border-2 border-black dark:border-white rounded-2xl px-4 py-2 shadow-neo-sm text-xs font-black w-full max-w-2xl z-10">
          
          {/* Page Indicator & Navigation */}
          <div className="flex items-center gap-2">
            <span className="bg-neo-yellow text-black border border-black px-2.5 py-0.5 rounded-md shadow-neo-sm font-black">
              Hal {currentPage} / {numPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || isLoadingPdf}
              className="p-1 border border-black dark:border-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-3.5 h-3.5 stroke-[3]" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages || isLoadingPdf}
              className="p-1 border border-black dark:border-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
              title="Halaman Berikutnya"
            >
              <ChevronRight className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#2A2A2A] border border-black dark:border-white rounded-xl px-1.5 py-0.5">
            <button
              onClick={() => setScale(s => Math.max(0.6, Number((s - 0.2).toFixed(1))))}
              className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
            <span className="px-1 text-[11px] font-black">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.min(2.5, Number((s + 0.2).toFixed(1))))}
              className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          {/* Per-Page Actions: Rotate Left, Rotate Right, Insert Blank, Delete Page */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleRotatePage('ccw')}
              className="p-1.5 border border-black dark:border-white rounded-xl hover:bg-neo-yellow text-black dark:text-white dark:hover:text-black shadow-neo-sm transition cursor-pointer"
              title="Putar Halaman Kiri (-90°)"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>

            <button
              onClick={() => handleRotatePage('cw')}
              className="p-1.5 border border-black dark:border-white rounded-xl hover:bg-neo-yellow text-black dark:text-white dark:hover:text-black shadow-neo-sm transition cursor-pointer"
              title="Putar Halaman Kanan (+90°)"
            >
              <RotateCw className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>

            <button
              onClick={handleInsertPage}
              className="p-1.5 border border-black dark:border-white rounded-xl hover:bg-neo-green text-black dark:text-white dark:hover:text-black shadow-neo-sm transition cursor-pointer"
              title="+ Sisipkan Halaman Baru di Sini"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </button>

            <button
              onClick={handleDeletePage}
              className="p-1.5 border border-black dark:border-white rounded-xl hover:bg-rose-500 text-rose-600 hover:text-white shadow-neo-sm transition cursor-pointer"
              title="Hapus Halaman Ini"
            >
              <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Loading PDF indicator */}
        {isLoadingPdf && (
          <div className="flex flex-col items-center gap-3 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl p-6 shadow-neo-lg text-black dark:text-white my-auto">
            <Loader2 className="w-8 h-8 animate-spin text-neo-pink stroke-[2.5]" />
            <span className="font-black text-xs uppercase tracking-wider">
              Merender Dokumen PDF...
            </span>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="bg-red-100 border-[3px] border-red-900 rounded-2xl p-6 text-red-900 max-w-md shadow-neo my-auto">
            <p className="font-black text-sm uppercase mb-2">Terjadi Kesalahan</p>
            <p className="text-xs font-bold leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* PDF Page Wrapper Container */}
        {!isLoadingPdf && !errorMessage && (
          <div
            className={`relative bg-white shadow-[10px_10px_0px_#000] dark:shadow-[10px_10px_0px_#FFF] border-[3px] border-black dark:border-white transition-all ${
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
              className="absolute inset-0 z-10 overflow-visible"
            >
              {pageAnnotations.map((ann) => {
                const isSelected = selectedAnnId === ann.id;

                // Zoom-independent relative calculation
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
                    className={`absolute select-none transition-shadow ${
                      ann.type === 'text'
                        ? isSelected
                          ? 'border border-blue-500 ring-1 ring-blue-400/50 cursor-move'
                          : 'border border-transparent hover:border-blue-400/40 cursor-text'
                        : isSelected
                        ? 'border-2 border-dashed border-black dark:border-white cursor-move'
                        : 'hover:border border-black/40 cursor-move'
                    }`}
                    style={{
                      left: screenX,
                      top: screenY,
                      width: ann.type === 'text' ? 'auto' : screenW,
                      height: ann.type === 'text' ? 'auto' : screenH,
                      minWidth: ann.type === 'text' ? '40px' : undefined
                    }}
                  >
                    {/* FLOATING ACTION TOOLBAR (SEJDA STYLE: DOCKED DIRECTLY ABOVE ACTIVE ITEM) */}
                    {isSelected && (
                      <div
                        className="absolute -top-11 left-0 bg-white dark:bg-[#1E1E1E] border-2 border-black dark:border-white rounded-xl shadow-neo-sm px-2 py-1 flex items-center gap-1.5 z-40 text-black dark:text-white animate-in fade-in duration-100 whitespace-nowrap"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        {/* If text: Quick format controls */}
                        {ann.type === 'text' && (
                          <>
                            {/* Font size */}
                            <select
                              value={ann.fontSize || fontSize}
                              onChange={(e) => {
                                const newSize = Number(e.target.value);
                                setFontSize(newSize);
                                const updated = annotations.map(a => (a.id === ann.id ? { ...a, fontSize: newSize } : a));
                                setAnnotations(updated);
                                pushHistory(updated);
                              }}
                              className="bg-slate-100 dark:bg-[#252525] border border-black/30 rounded text-xs px-1.5 py-0.5 font-black cursor-pointer"
                            >
                              {[10, 12, 14, 16, 18, 20, 24, 32].map(s => (
                                <option key={s} value={s}>{s} pt</option>
                              ))}
                            </select>

                            {/* Bold */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextBold = !ann.isBold;
                                setIsBold(nextBold);
                                const updated = annotations.map(a => (a.id === ann.id ? { ...a, isBold: nextBold } : a));
                                setAnnotations(updated);
                                pushHistory(updated);
                              }}
                              className={`p-1 rounded cursor-pointer ${ann.isBold ? 'bg-neo-yellow text-black font-black' : 'hover:bg-slate-100'}`}
                              title="Tebal (Bold)"
                            >
                              <Bold className="w-3.5 h-3.5 stroke-[3]" />
                            </button>

                            {/* Italic */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextItalic = !ann.isItalic;
                                setIsItalic(nextItalic);
                                const updated = annotations.map(a => (a.id === ann.id ? { ...a, isItalic: nextItalic } : a));
                                setAnnotations(updated);
                                pushHistory(updated);
                              }}
                              className={`p-1 rounded cursor-pointer ${ann.isItalic ? 'bg-neo-yellow text-black font-black' : 'hover:bg-slate-100'}`}
                              title="Miring (Italic)"
                            >
                              <Italic className="w-3.5 h-3.5 stroke-[3]" />
                            </button>

                            {/* Colors */}
                            <div className="flex items-center gap-1 mx-1">
                              {['#000000', '#DC2626', '#0B3B8B', '#16A34A'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => {
                                    setTextColor(color);
                                    const updated = annotations.map(a => (a.id === ann.id ? { ...a, color } : a));
                                    setAnnotations(updated);
                                    pushHistory(updated);
                                  }}
                                  className={`w-3.5 h-3.5 rounded-full border border-black transition-transform cursor-pointer ${
                                    ann.color === color ? 'scale-125 ring-1 ring-black' : ''
                                  }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-0.5" />
                          </>
                        )}

                        {/* Duplicate */}
                        <button
                          type="button"
                          onClick={(e) => handleDuplicate(ann.id, e)}
                          className="p-1 hover:bg-neo-yellow hover:text-black rounded transition-colors cursor-pointer"
                          title="Duplikasi Objek"
                        >
                          <Copy className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        {/* Delete */}
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

                    {/* Type 1: Seamless Sejda Text Box */}
                    {ann.type === 'text' && (
                      <textarea
                        rows={1}
                        value={ann.text ?? ''}
                        placeholder="Type your text"
                        onChange={(e) => {
                          handleTextChange(ann.id, e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        onBlur={() => pushHistory(annotations)}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          fontSize: `${((ann.fontSize || 14) * scale)}px`,
                          color: ann.color || '#000000',
                          fontWeight: ann.isBold ? 800 : 500,
                          fontStyle: ann.isItalic ? 'italic' : 'normal',
                          lineHeight: '1.2'
                        }}
                        className="w-full bg-transparent resize-none overflow-hidden outline-none border-none p-0 m-0 font-sans tracking-tight placeholder:text-slate-400 block whitespace-pre-wrap"
                      />
                    )}

                    {/* Type 2: Whiteout Box */}
                    {ann.type === 'whiteout' && (
                      <div className="w-full h-full bg-white shadow-sm border border-slate-300" />
                    )}

                    {/* Type 3: Highlight Box */}
                    {ann.type === 'highlight' && (
                      <div className="w-full h-full bg-[#FFE600]/40 border-b-2 border-amber-400" />
                    )}

                    {/* Type 4: Shape Rect */}
                    {ann.type === 'rect' && (
                      <div
                        className="w-full h-full border-2"
                        style={{ borderColor: ann.color || '#000000' }}
                      />
                    )}

                    {/* Type 5: Shape Circle */}
                    {ann.type === 'circle' && (
                      <div
                        className="w-full h-full border-2 rounded-full"
                        style={{ borderColor: ann.color || '#000000' }}
                      />
                    )}

                    {/* Type 6: Shape Line */}
                    {ann.type === 'line' && (
                      <div
                        className="w-full h-[2px]"
                        style={{ backgroundColor: ann.color || '#000000' }}
                      />
                    )}

                    {/* Type 7: Link Box */}
                    {ann.type === 'link' && (
                      <div className="w-full h-full bg-sky-200/40 border-2 border-dashed border-sky-500 rounded p-1 flex items-center justify-center text-[10px] font-bold text-sky-800">
                        {ann.url}
                      </div>
                    )}

                    {/* Type 8: Form Checkbox */}
                    {ann.type === 'form' && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = annotations.map(a => (a.id === ann.id ? { ...a, checked: !a.checked } : a));
                          setAnnotations(updated);
                          pushHistory(updated);
                        }}
                        className="w-full h-full border-2 border-black bg-white rounded cursor-pointer flex items-center justify-center font-black text-xs"
                      >
                        {ann.checked && '✓'}
                      </div>
                    )}

                    {/* Type 9: Signature or Image Stamp */}
                    {(ann.type === 'signature' || ann.type === 'image') && ann.imageData && (
                      <img
                        src={ann.imageData}
                        alt="Anotasi"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    )}

                    {/* 4-CORNER RESIZE HANDLES (MINIMALIST SEJDA STYLE) */}
                    {isSelected && ann.type !== 'text' && (
                      <>
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'tl')}
                          className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nwse-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'tr')}
                          className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nesw-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'bl')}
                          className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nesw-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownItem(e, ann.id, 'resize', 'br')}
                          className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nwse-resize z-30"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FLOATING BOTTOM CTA (SEJDA STYLE: "TERAPKAN PERUBAHAN & UNDUH PDF") */}
        <div className="sticky bottom-6 mt-8 z-30 flex items-center justify-center">
          <button
            onClick={handleApplyAndDownload}
            disabled={isApplying || isLoadingPdf}
            className={`px-8 py-4 border-[3px] border-black dark:border-white rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-3 shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#FFF] transition-all cursor-pointer ${
              isApplying || isLoadingPdf
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed border-dashed'
                : 'bg-neo-green text-black hover:bg-emerald-400 hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-1 active:translate-y-1'
            }`}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-black" />
                <span>{applyStep || 'Menerapkan Perubahan...'}</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5 stroke-[2.5]" />
                <span>TERAPKAN PERUBAHAN & UNDUH PDF</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
