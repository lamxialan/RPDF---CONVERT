import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
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
  Underline,
  Strikethrough,
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
  ArrowRight,
  Search,
  Undo2,
  Redo2,
  Stamp,
  Eye,
  EyeOff
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

export interface EditorPage {
  id: string;
  pageIndex: number; // 0-based in document
  originalPageIndex: number; // 0-based in original PDF, -1 if newly inserted
  isNew: boolean;
  width: number;
  height: number;
  rotation: number;
}

type EditorTool =
  | 'select'
  | 'text'
  | 'whiteout'
  | 'highlight'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'strikeout'
  | 'underline'
  | 'link'
  | 'form'
  | 'stamp'
  | 'draw'
  | 'freehand_highlight';

interface SearchMatch {
  page: number; // 1-indexed page
  x: number;
  y: number;
  width: number;
  height: number;
  rect: [number, number, number, number];
}

export const PdfSignEditor: React.FC<PdfSignEditorProps> = ({
  file,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1); // 1-indexed relative to pages array
  const [scale, setScale] = useState<number>(1.2);
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [viewportDimensions, setViewportDimensions] = useState<{ width: number; height: number }>({ width: 600, height: 800 });

  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applyStep, setApplyStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Active Tool & Properties
  const [activeTool, setActiveTool] = useState<EditorTool>('text');
  const [fontSize, setFontSize] = useState<number>(14);
  const [textColor, setTextColor] = useState<string>('#000000');
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [isUnderline, setIsUnderline] = useState<boolean>(false);
  const [isStrikeout, setIsStrikeout] = useState<boolean>(false);

  // Dropdown States
  const [formsMenuOpen, setFormsMenuOpen] = useState<boolean>(false);
  const [imagesMenuOpen, setImagesMenuOpen] = useState<boolean>(false);
  const [annotateMenuOpen, setAnnotateMenuOpen] = useState<boolean>(false);
  const [shapesMenuOpen, setShapesMenuOpen] = useState<boolean>(false);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [formEditMode, setFormEditMode] = useState<boolean>(true);

  // Find & Replace States
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchStatus, setSearchStatus] = useState<string>('');
  const [queuedReplacements, setQueuedReplacements] = useState<Array<{ search: string; replace: string; page?: number }>>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Annotations History (Undo / Redo stack)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [history, setHistory] = useState<PdfAnnotation[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);

  // Freehand drawing state
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);

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

  // Helper notice that auto clears
  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.editor-dropdown-container')) {
        setFormsMenuOpen(false);
        setImagesMenuOpen(false);
        setAnnotateMenuOpen(false);
        setShapesMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Record undo/redo history
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

  // Keyboard shortcut listener: Delete, Backspace, Ctrl+Z, Ctrl+Y, Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Find & Replace: Ctrl+F / Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsFindReplaceOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        return;
      }

      // Undo / Redo: Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z
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

  // Load PDF Document & Initialize Pages state
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
    setSearchResults([]);
    setCurrentMatchIndex(-1);
    setIsFindReplaceOpen(false);

    const loadPdf = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(doc);

        const initialPages: EditorPage[] = [];
        for (let i = 0; i < doc.numPages; i++) {
          initialPages.push({
            id: `orig_page_${i}_${Date.now()}`,
            pageIndex: i,
            originalPageIndex: i,
            isNew: false,
            width: 595,
            height: 842,
            rotation: 0
          });
        }
        setPages(initialPages);
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

  // Active page object
  const activePageObj = pages[currentPage - 1];

  // Render Page to Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!canvasRef.current || !activePageObj) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A. JIKA HALAMAN BARU KOSONG (isNew === true)
    if (activePageObj.isNew) {
      const isRotated90 = (activePageObj.rotation % 180) !== 0;
      const baseW = isRotated90 ? activePageObj.height : activePageObj.width;
      const baseH = isRotated90 ? activePageObj.width : activePageObj.height;

      setNaturalDimensions({ width: baseW, height: baseH });

      const viewW = Math.round(baseW * scale);
      const viewH = Math.round(baseH * scale);
      setViewportDimensions({ width: viewW, height: viewH });

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Render crisp pure white sheet
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, viewW, viewH);

      // Optional subtle watermark indicator for empty page
      ctx.fillStyle = '#F3F4F6';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`— HALAMAN KOSONG #${currentPage} —`, viewW / 2, 40);

      ctx.restore();
      return;
    }

    // B. JIKA HALAMAN ASLI DARI DOKUMEN PDF
    if (!pdfDoc) return;

    try {
      const originalPdfPageNum = activePageObj.originalPageIndex + 1;
      const page = await pdfDoc.getPage(originalPdfPageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      setNaturalDimensions({
        width: unscaledViewport.width,
        height: unscaledViewport.height
      });

      const totalRotation = ((page.rotate || 0) + (activePageObj.rotation || 0)) % 360;
      const viewport = page.getViewport({ scale, rotation: totalRotation });

      setViewportDimensions({
        width: viewport.width,
        height: viewport.height
      });

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
  }, [pdfDoc, activePageObj, currentPage, scale]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Click on Canvas overlay to place new annotations
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;

    // Deselect if clicking on empty space in select mode
    if (activeTool === 'select' || activeTool === 'draw' || activeTool === 'freehand_highlight') {
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
      newAnn = {
        id,
        page: currentPage,
        type: 'text',
        x: Math.max(5, Math.min(natX, naturalDimensions.width - 140)),
        y: Math.max(5, Math.min(natY - 8, naturalDimensions.height - 30)),
        width: 140,
        height: 28,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height,
        text: '', // Empty text so placeholder "Type your text" appears naturally
        fontSize: fontSize,
        color: textColor,
        isBold: isBold,
        isItalic: isItalic,
        isUnderline: isUnderline,
        isStrikeout: isStrikeout
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
        color: textColor || '#FFE600',
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    } else if (activeTool === 'strikeout') {
      newAnn = {
        id,
        page: currentPage,
        type: 'strikeout',
        x: Math.max(5, Math.min(natX - 45, naturalDimensions.width - 90)),
        y: Math.max(5, Math.min(natY - 8, naturalDimensions.height - 16)),
        width: 90,
        height: 16,
        color: textColor || '#EF4444',
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      };
    } else if (activeTool === 'underline') {
      newAnn = {
        id,
        page: currentPage,
        type: 'underline',
        x: Math.max(5, Math.min(natX - 45, naturalDimensions.width - 90)),
        y: Math.max(5, Math.min(natY - 8, naturalDimensions.height - 16)),
        width: 90,
        height: 16,
        color: textColor || '#3B82F6',
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
    } else if (activeTool === 'arrow') {
      newAnn = {
        id,
        page: currentPage,
        type: 'arrow',
        x: Math.max(5, natX - 50),
        y: Math.max(5, natY),
        width: 100,
        height: 14,
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
        width: 22,
        height: 22,
        checked: false,
        formType: 'checkbox',
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

  // Freehand Drawing Handlers
  const handleFreehandMouseDown = (e: React.MouseEvent) => {
    if (activeTool !== 'draw' && activeTool !== 'freehand_highlight') return;
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const natX = ((e.clientX - rect.left) / viewportDimensions.width) * naturalDimensions.width;
    const natY = ((e.clientY - rect.top) / viewportDimensions.height) * naturalDimensions.height;

    setIsDrawing(true);
    setCurrentStroke([{ x: natX, y: natY }]);
  };

  const handleFreehandMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || (activeTool !== 'draw' && activeTool !== 'freehand_highlight')) return;
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const natX = ((e.clientX - rect.left) / viewportDimensions.width) * naturalDimensions.width;
    const natY = ((e.clientY - rect.top) / viewportDimensions.height) * naturalDimensions.height;

    setCurrentStroke(prev => [...prev, { x: natX, y: natY }]);
  };

  const handleFreehandMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStroke.length > 1) {
      const minX = Math.min(...currentStroke.map(p => p.x));
      const minY = Math.min(...currentStroke.map(p => p.y));
      const maxX = Math.max(...currentStroke.map(p => p.x));
      const maxY = Math.max(...currentStroke.map(p => p.y));

      const newAnn: PdfAnnotation = {
        id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
        page: currentPage,
        type: 'freehand',
        x: minX,
        y: minY,
        width: Math.max(10, maxX - minX),
        height: Math.max(10, maxY - minY),
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height,
        color: activeTool === 'freehand_highlight' ? '#FACC15' : textColor,
        points: currentStroke
      };

      const updated = [...annotations, newAnn];
      setAnnotations(updated);
      pushHistory(updated);
    }
    setCurrentStroke([]);
  };

  // Add Quick Symbol (Forms Dropdown)
  const handleAddSymbol = (symbol: '✕' | '✓' | '■') => {
    const defaultColor = symbol === '✕' ? '#DC2626' : symbol === '✓' ? '#16A34A' : '#000000';
    const newAnn: PdfAnnotation = {
      id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
      page: currentPage,
      type: 'text',
      x: naturalDimensions.width / 2 - 15,
      y: naturalDimensions.height / 2 - 15,
      width: 32,
      height: 32,
      page_width: naturalDimensions.width,
      page_height: naturalDimensions.height,
      text: symbol,
      fontSize: 22,
      color: defaultColor,
      isBold: true
    };
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    pushHistory(updated);
    setSelectedAnnId(newAnn.id);
    setActiveTool('select');
    setFormsMenuOpen(false);
    showNotice(`Simbol ${symbol} berhasil ditambahkan ke dokumen.`);
  };

  // Add Form Field (Forms Dropdown)
  const handleAddFormField = (fType: 'text' | 'multiline' | 'dropdown' | 'radio' | 'checkbox' | 'signature') => {
    const isBox = fType === 'text' || fType === 'multiline' || fType === 'dropdown' || fType === 'signature';
    const w = isBox ? 160 : 24;
    const h = fType === 'multiline' ? 60 : fType === 'signature' ? 50 : 26;

    const newAnn: PdfAnnotation = {
      id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
      page: currentPage,
      type: 'form',
      formType: fType,
      x: naturalDimensions.width / 2 - w / 2,
      y: naturalDimensions.height / 2 - h / 2,
      width: w,
      height: h,
      checked: false,
      text: fType === 'text' ? 'Text Field' : fType === 'dropdown' ? 'Option 1, Option 2' : '',
      page_width: naturalDimensions.width,
      page_height: naturalDimensions.height
    };
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    pushHistory(updated);
    setSelectedAnnId(newAnn.id);
    setActiveTool('select');
    setFormsMenuOpen(false);
    showNotice(`Form field [${fType.toUpperCase()}] berhasil ditambahkan.`);
  };

  // Add Stamp Badge (Images Dropdown)
  const handleAddTextStamp = (stampText: 'DRAFT' | 'APPROVED' | 'CONFIDENTIAL') => {
    const colorMap = {
      DRAFT: '#EA580C',
      APPROVED: '#16A34A',
      CONFIDENTIAL: '#DC2626'
    };
    const w = 150;
    const h = 45;

    const newAnn: PdfAnnotation = {
      id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
      page: currentPage,
      type: 'stamp',
      stampText,
      color: colorMap[stampText],
      x: naturalDimensions.width / 2 - w / 2,
      y: naturalDimensions.height / 2 - h / 2,
      width: w,
      height: h,
      page_width: naturalDimensions.width,
      page_height: naturalDimensions.height
    };
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    pushHistory(updated);
    setSelectedAnnId(newAnn.id);
    setActiveTool('select');
    setImagesMenuOpen(false);
    showNotice(`Stempel badge "${stampText}" berhasil ditambahkan.`);
  };

  // Add Custom Stamp
  const handleAddCustomStamp = () => {
    const text = window.prompt('Masukkan teks untuk cap stempel baru:', 'LUNAS');
    if (!text || !text.trim()) return;

    const w = Math.max(120, text.length * 14);
    const h = 45;

    const newAnn: PdfAnnotation = {
      id: 'ann_' + Date.now() + Math.random().toString(36).substring(2, 6),
      page: currentPage,
      type: 'stamp',
      stampText: text.trim().toUpperCase(),
      color: textColor || '#DC2626',
      x: naturalDimensions.width / 2 - w / 2,
      y: naturalDimensions.height / 2 - h / 2,
      width: w,
      height: h,
      page_width: naturalDimensions.width,
      page_height: naturalDimensions.height
    };
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    pushHistory(updated);
    setSelectedAnnId(newAnn.id);
    setActiveTool('select');
    setImagesMenuOpen(false);
    showNotice(`Stempel kustom "${text}" berhasil ditambahkan.`);
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

  // Duplicate an annotation
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

  // ========================================================
  // PERBAIKAN FITUR TAMBAH & HAPUS HALAMAN (DYNAMIC INSERT PAGE)
  // ========================================================
  const handleInsertPage = () => {
    const newPageId = `new_page_${Date.now()}`;
    const newPage: EditorPage = {
      id: newPageId,
      pageIndex: currentPage, // Sisipkan tepat setelah halaman aktif
      originalPageIndex: -1,
      isNew: true,
      width: 595,
      height: 842,
      rotation: 0
    };

    const nextPages = [
      ...pages.slice(0, currentPage),
      newPage,
      ...pages.slice(currentPage)
    ].map((p, idx) => ({
      ...p,
      pageIndex: idx
    }));

    setPages(nextPages);
    setCurrentPage(currentPage + 1); // Pindah langsung ke halaman baru
    showNotice(`Halaman kosong baru ditambahkan (Hal ${currentPage + 1} dari ${nextPages.length}).`);
  };

  const handleDeletePage = () => {
    if (pages.length <= 1) {
      showNotice('Dokumen PDF harus memiliki minimal 1 lembar halaman.');
      return;
    }

    const removedIndex = currentPage - 1;
    const nextPages = pages
      .filter((_, idx) => idx !== removedIndex)
      .map((p, idx) => ({
        ...p,
        pageIndex: idx
      }));

    // Hapus anotasi pada halaman yang dihapus
    const updatedAnnotations = annotations.filter(a => a.page !== currentPage);
    setAnnotations(updatedAnnotations);
    pushHistory(updatedAnnotations);

    setPages(nextPages);
    const newCurrent = Math.max(1, Math.min(nextPages.length, currentPage));
    setCurrentPage(newCurrent);
    showNotice(`Halaman ${currentPage} berhasil dihapus.`);
  };

  const handleRotatePage = (direction: 'cw' | 'ccw') => {
    if (!activePageObj) return;
    const delta = direction === 'cw' ? 90 : -90;
    const newRot = (activePageObj.rotation + delta + 360) % 360;

    setPages(prev =>
      prev.map((p, idx) => (idx === currentPage - 1 ? { ...p, rotation: newRot } : p))
    );
  };

  // ========================================================
  // LOGIKA FIND & REPLACE (CARI & GANTI TEKS)
  // ========================================================
  const handleSearchText = async () => {
    if (!searchQuery || !searchQuery.trim()) {
      setSearchStatus('Masukkan kata kunci pencarian.');
      return;
    }

    setIsSearching(true);
    setSearchStatus('Mencari...');
    setSearchResults([]);
    setCurrentMatchIndex(-1);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('query', searchQuery.trim());

      const res = await fetch(getApiUrl('/api/pdf/search-text'), {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        const matches: SearchMatch[] = data.matches || [];

        if (matches.length > 0) {
          setSearchResults(matches);
          setCurrentMatchIndex(0);
          setSearchStatus(`${matches.length} kata ditemukan.`);
          // Pindah ke halaman tempat temuan pertama jika di luar halaman aktif
          if (matches[0].page && matches[0].page !== currentPage && matches[0].page <= pages.length) {
            setCurrentPage(matches[0].page);
          }
        } else {
          // Fallback pencarian client-side PDF.js jika backend tidak menemukan
          await clientSidePdfSearch(searchQuery.trim());
        }
      } else {
        await clientSidePdfSearch(searchQuery.trim());
      }
    } catch (_) {
      await clientSidePdfSearch(searchQuery.trim());
    } finally {
      setIsSearching(false);
    }
  };

  // Client-side PDF.js text search fallback
  const clientSidePdfSearch = async (query: string) => {
    if (!pdfDoc) {
      setSearchStatus('Teks tidak ditemukan.');
      return;
    }

    const matches: SearchMatch[] = [];
    const lowerQuery = query.toLowerCase();

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      try {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        for (const item of textContent.items as any[]) {
          if (item.str && item.str.toLowerCase().includes(lowerQuery)) {
            const tx = item.transform[4];
            const ty = viewport.height - item.transform[5] - (item.height || 12);
            matches.push({
              page: p,
              x: Math.max(0, tx),
              y: Math.max(0, ty),
              width: item.width || query.length * 8,
              height: item.height || 16,
              rect: [tx, ty, tx + (item.width || 50), ty + 16]
            });
          }
        }
      } catch (_) {}
    }

    if (matches.length > 0) {
      setSearchResults(matches);
      setCurrentMatchIndex(0);
      setSearchStatus(`${matches.length} kata ditemukan.`);
      if (matches[0].page !== currentPage && matches[0].page <= pages.length) {
        setCurrentPage(matches[0].page);
      }
    } else {
      setSearchResults([]);
      setSearchStatus('Kata tidak ditemukan di dokumen.');
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    const targetMatch = searchResults[nextIdx];
    if (targetMatch.page !== currentPage && targetMatch.page <= pages.length) {
      setCurrentPage(targetMatch.page);
    }
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    const targetMatch = searchResults[prevIdx];
    if (targetMatch.page !== currentPage && targetMatch.page <= pages.length) {
      setCurrentPage(targetMatch.page);
    }
  };

  // Replace Current Match
  const handleReplaceCurrent = () => {
    if (currentMatchIndex < 0 || currentMatchIndex >= searchResults.length) return;
    const match = searchResults[currentMatchIndex];

    // 1. Redact area dengan whiteout
    const whiteoutAnn: PdfAnnotation = {
      id: 'rep_wo_' + Date.now(),
      page: match.page,
      type: 'whiteout',
      x: match.x - 2,
      y: match.y - 2,
      width: match.width + 4,
      height: match.height + 4,
      page_width: naturalDimensions.width,
      page_height: naturalDimensions.height
    };

    // 2. Tuliskan teks pengganti
    const textAnn: PdfAnnotation = {
      id: 'rep_tx_' + Date.now(),
      page: match.page,
      type: 'text',
      x: match.x,
      y: match.y,
      width: Math.max(match.width, replaceQuery.length * 8),
      height: match.height,
      text: replaceQuery,
      fontSize: Math.max(10, Math.min(match.height * 0.85, 24)),
      color: '#000000',
      page_width: naturalDimensions.width,
      page_height: naturalDimensions.height
    };

    const updated = [...annotations, whiteoutAnn, textAnn];
    setAnnotations(updated);
    pushHistory(updated);

    // Queue for backend vector PyMuPDF replace
    setQueuedReplacements(prev => [...prev, { search: searchQuery, replace: replaceQuery, page: match.page }]);

    // Hapus match dari list
    const remaining = searchResults.filter((_, idx) => idx !== currentMatchIndex);
    setSearchResults(remaining);
    if (remaining.length > 0) {
      const nextIdx = Math.min(currentMatchIndex, remaining.length - 1);
      setCurrentMatchIndex(nextIdx);
      setSearchStatus(`${remaining.length} kata tersisa.`);
      if (remaining[nextIdx].page !== currentPage && remaining[nextIdx].page <= pages.length) {
        setCurrentPage(remaining[nextIdx].page);
      }
    } else {
      setCurrentMatchIndex(-1);
      setSearchStatus('Teks berhasil diganti!');
    }
  };

  // Replace All Matches
  const handleReplaceAll = () => {
    if (searchResults.length === 0) return;

    const newAnns: PdfAnnotation[] = [];
    searchResults.forEach((m, i) => {
      newAnns.push({
        id: `rep_all_wo_${Date.now()}_${i}`,
        page: m.page,
        type: 'whiteout',
        x: m.x - 2,
        y: m.y - 2,
        width: m.width + 4,
        height: m.height + 4,
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      });
      newAnns.push({
        id: `rep_all_tx_${Date.now()}_${i}`,
        page: m.page,
        type: 'text',
        x: m.x,
        y: m.y,
        width: Math.max(m.width, replaceQuery.length * 8),
        height: m.height,
        text: replaceQuery,
        fontSize: Math.max(10, Math.min(m.height * 0.85, 24)),
        color: '#000000',
        page_width: naturalDimensions.width,
        page_height: naturalDimensions.height
      });
    });

    const updated = [...annotations, ...newAnns];
    setAnnotations(updated);
    pushHistory(updated);

    setQueuedReplacements(prev => [...prev, { search: searchQuery, replace: replaceQuery }]);
    setSearchStatus(`Semua ${searchResults.length} kata berhasil diganti!`);
    setSearchResults([]);
    setCurrentMatchIndex(-1);
    showNotice(`Berhasil mengganti semua temuan teks dengan "${replaceQuery}".`);
  };

  // ========================================================
  // DRAG & RESIZE HANDLERS
  // ========================================================
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
    if (isDrawing) {
      handleFreehandMouseMove(e);
      return;
    }

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
    if (isDrawing) {
      handleFreehandMouseUp();
    }
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

  // ========================================================
  // SAVE & APPLY VIA BACKEND PYMUPDF
  // ========================================================
  const handleApplyAndDownload = async () => {
    if (!file || isApplying) return;

    setIsApplying(true);
    setErrorMessage(null);
    setApplyStep('Memproses susunan halaman...');

    try {
      await new Promise(r => setTimeout(r, 300));
      setApplyStep('Menerapkan anotasi & PyMuPDF...');

      const pagesStructure = pages.map(p => ({
        original_index: p.originalPageIndex,
        is_new: p.isNew,
        width: p.width,
        height: p.height,
        rotation: p.rotation
      }));

      const payload = {
        pages_structure: pagesStructure,
        annotations: annotations,
        replacements: queuedReplacements
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
  const currentMatchesOnThisPage = searchResults.filter(m => m.page === currentPage);

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
                v2.5
              </span>
            </h2>
            <p className="text-[10px] font-bold text-slate-500 truncate max-w-xs sm:max-w-md">
              {file.name} • {totalAnnotationsCount} elemen • {pages.length} halaman
            </p>
          </div>
        </div>

        {/* Action Controls: Find & Replace, Undo, Redo, Close */}
        <div className="flex items-center gap-2">
          {/* Find & Replace Toggle Button */}
          <button
            onClick={() => {
              setIsFindReplaceOpen(prev => !prev);
              if (!isFindReplaceOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }
            }}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white text-xs font-black uppercase flex items-center gap-1.5 shadow-neo-sm transition cursor-pointer ${
              isFindReplaceOpen
                ? 'bg-neo-yellow text-black ring-2 ring-black'
                : 'bg-white dark:bg-[#252525] hover:bg-neo-yellow/30'
            }`}
            title="Cari & Ganti Teks (Ctrl + F)"
          >
            <Search className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Find & Replace</span>
          </button>

          {/* Undo / Redo */}
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

          {/* Close */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl border-2 border-black dark:border-white bg-slate-100 dark:bg-[#2A2A2A] hover:bg-neo-pink flex items-center justify-center transition-colors shadow-neo-sm cursor-pointer"
            title="Tutup Editor"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* SEJDA MAIN TOOLBAR: Full Suite of Neo-Brutalist Dropdown Menus */}
      <div className="bg-[#FAF9F5] dark:bg-[#202020] border-b-2 border-black dark:border-white px-4 py-2 flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap text-xs font-black z-20">

        {/* 1. Text Tool */}
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

        {/* 3. FORMS DROPDOWN */}
        <div className="relative editor-dropdown-container">
          <button
            onClick={() => setFormsMenuOpen(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTool === 'form' || formsMenuOpen
                ? 'bg-emerald-300 text-black shadow-neo-sm ring-2 ring-black'
                : 'bg-white dark:bg-[#181818] hover:bg-emerald-100'
            }`}
            title="Formulir & Simbol"
          >
            <CheckSquare className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Forms</span>
            <ChevronDown className="w-3 h-3 stroke-[3]" />
          </button>

          {formsMenuOpen && (
            <div className="absolute top-full mt-1.5 left-0 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl shadow-neo p-3 z-50 flex flex-col gap-2 w-64 text-left">
              {/* Category 1: Symbols */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">
                  Add Text and Symbols
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleAddSymbol('✕')}
                    className="p-1.5 border-2 border-black dark:border-white rounded-xl hover:bg-rose-100 text-rose-600 font-black text-sm flex items-center justify-center cursor-pointer shadow-neo-sm"
                    title="Silang (X)"
                  >
                    ✕
                  </button>
                  <button
                    onClick={() => handleAddSymbol('✓')}
                    className="p-1.5 border-2 border-black dark:border-white rounded-xl hover:bg-emerald-100 text-emerald-600 font-black text-sm flex items-center justify-center cursor-pointer shadow-neo-sm"
                    title="Centang (✓)"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => handleAddSymbol('■')}
                    className="p-1.5 border-2 border-black dark:border-white rounded-xl hover:bg-slate-200 text-black dark:text-white font-black text-sm flex items-center justify-center cursor-pointer shadow-neo-sm"
                    title="Kotak Hitam (■)"
                  >
                    ■
                  </button>
                </div>
              </div>

              <div className="h-[2px] bg-slate-200 dark:bg-slate-700 my-1" />

              {/* Category 2: Form Fields */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">
                  Add New Form Fields
                </p>
                <div className="flex flex-col gap-1 text-xs">
                  <button
                    onClick={() => handleAddFormField('text')}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>Text field</span>
                    <span className="text-[10px] text-slate-400 font-mono">[ ]</span>
                  </button>
                  <button
                    onClick={() => handleAddFormField('multiline')}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>Text multiline</span>
                    <span className="text-[10px] text-slate-400 font-mono">[===]</span>
                  </button>
                  <button
                    onClick={() => handleAddFormField('dropdown')}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>Drop-down list</span>
                    <span className="text-[10px] text-slate-400 font-mono">▼</span>
                  </button>
                  <button
                    onClick={() => handleAddFormField('radio')}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>Radio button</span>
                    <span className="text-[10px] text-slate-400 font-mono">○</span>
                  </button>
                  <button
                    onClick={() => handleAddFormField('checkbox')}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>Checkbox</span>
                    <span className="text-[10px] text-slate-400 font-mono">☑</span>
                  </button>
                  <button
                    onClick={() => handleAddFormField('signature')}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between text-left cursor-pointer text-neo-pink"
                  >
                    <span>Signature box</span>
                    <span className="text-[10px] font-mono">✍</span>
                  </button>
                </div>
              </div>

              <div className="h-[2px] bg-slate-200 dark:bg-slate-700 my-1" />

              {/* Category 3: Edit Mode */}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[11px] font-bold">Form Edit Mode</span>
                <button
                  onClick={() => setFormEditMode(!formEditMode)}
                  className={`px-2 py-0.5 text-[10px] font-black rounded-lg border border-black cursor-pointer ${
                    formEditMode ? 'bg-neo-green text-black' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {formEditMode ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. IMAGES DROPDOWN */}
        <div className="relative editor-dropdown-container">
          <button
            onClick={() => setImagesMenuOpen(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              imagesMenuOpen
                ? 'bg-amber-200 text-black shadow-neo-sm ring-2 ring-black'
                : 'bg-white dark:bg-[#181818] hover:bg-slate-100'
            }`}
            title="Gambar & Stempel"
          >
            <ImageIcon className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Images</span>
            <ChevronDown className="w-3 h-3 stroke-[3]" />
          </button>

          {imagesMenuOpen && (
            <div className="absolute top-full mt-1.5 left-0 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl shadow-neo p-3 z-50 flex flex-col gap-2 w-60 text-left">
              {/* Category 1: Quick Stamps */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">
                  Stempel Teks Cepat
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    onClick={() => handleAddTextStamp('DRAFT')}
                    className="px-2 py-1.5 border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 font-black rounded-xl text-center hover:scale-102 transition cursor-pointer shadow-neo-sm"
                  >
                    DRAFT
                  </button>
                  <button
                    onClick={() => handleAddTextStamp('APPROVED')}
                    className="px-2 py-1.5 border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 font-black rounded-xl text-center hover:scale-102 transition cursor-pointer shadow-neo-sm"
                  >
                    APPROVED
                  </button>
                  <button
                    onClick={() => handleAddTextStamp('CONFIDENTIAL')}
                    className="px-2 py-1.5 border-2 border-rose-600 bg-rose-50 dark:bg-rose-950/40 text-rose-700 font-black rounded-xl text-center hover:scale-102 transition cursor-pointer shadow-neo-sm"
                  >
                    CONFIDENTIAL
                  </button>
                </div>
              </div>

              <div className="h-[2px] bg-slate-200 dark:bg-slate-700 my-1" />

              {/* Category 2: Image Actions */}
              <div className="flex flex-col gap-1 text-xs">
                <button
                  onClick={() => {
                    setImagesMenuOpen(false);
                    stampInputRef.current?.click();
                  }}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 cursor-pointer font-bold"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>+ New Image (Upload)</span>
                </button>
                <button
                  onClick={handleAddCustomStamp}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 cursor-pointer font-bold"
                >
                  <Stamp className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>New Stamp (Teks Kustom)</span>
                </button>
                {selectedAnnId && (
                  <button
                    onClick={() => {
                      handleDelete(selectedAnnId);
                      setImagesMenuOpen(false);
                    }}
                    className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 rounded-lg flex items-center gap-2 cursor-pointer font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Hapus Gambar Terpilih</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. Sign Tool */}
        <button
          onClick={() => setIsSigModalOpen(true)}
          className="px-3 py-1.5 rounded-xl border-2 border-black dark:border-white bg-neo-pink hover:bg-pink-400 text-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          title="Tanda Tangan Digital (Gambar, Ketik, atau Unggah)"
        >
          <PenTool className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Sign</span>
        </button>

        {/* 6. Whiteout Tool */}
        <button
          onClick={() => setActiveTool('whiteout')}
          className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTool === 'whiteout'
              ? 'bg-white text-black shadow-neo-sm scale-105 ring-2 ring-rose-500'
              : 'bg-white dark:bg-[#181818] hover:bg-slate-100'
          }`}
          title="Tutup Teks Lama (Whiteout Box)"
        >
          <Square className="w-3.5 h-3.5 stroke-[2.5] fill-white" />
          <span>Whiteout</span>
        </button>

        {/* 7. ANNOTATE DROPDOWN */}
        <div className="relative editor-dropdown-container">
          <button
            onClick={() => setAnnotateMenuOpen(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              ['highlight', 'strikeout', 'underline', 'draw', 'freehand_highlight'].includes(activeTool) || annotateMenuOpen
                ? 'bg-amber-300 text-black shadow-neo-sm ring-2 ring-black'
                : 'bg-white dark:bg-[#181818] hover:bg-amber-100'
            }`}
            title="Anotasi & Stabilo"
          >
            <Highlighter className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Annotate</span>
            <ChevronDown className="w-3 h-3 stroke-[3]" />
          </button>

          {annotateMenuOpen && (
            <div className="absolute top-full mt-1.5 left-0 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl shadow-neo p-3 z-50 flex flex-col gap-2 w-64 text-left">
              {/* Toggle Show Annotations */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold">Show annotations</span>
                <button
                  onClick={() => setShowAnnotations(!showAnnotations)}
                  className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer"
                  title={showAnnotations ? 'Sembunyikan Anotasi' : 'Tampilkan Anotasi'}
                >
                  {showAnnotations ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                </button>
              </div>

              {/* Category TEXT */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-wider">
                  Text Markup
                </p>
                <div className="flex flex-col gap-1.5">
                  {/* Highlight */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveTool('highlight');
                        setAnnotateMenuOpen(false);
                      }}
                      className="text-xs font-bold hover:underline cursor-pointer flex items-center gap-1.5"
                    >
                      <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                      <span>Highlight</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {['#FFE600', '#FECACA', '#BBF7D0', '#BAE6FD', '#E2E8F0'].map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            setTextColor(c);
                            setActiveTool('highlight');
                            setAnnotateMenuOpen(false);
                          }}
                          className="w-3 h-3 rounded-full border border-black cursor-pointer hover:scale-125 transition"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Strikeout */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveTool('strikeout');
                        setAnnotateMenuOpen(false);
                      }}
                      className="text-xs font-bold hover:underline cursor-pointer flex items-center gap-1.5"
                    >
                      <Strikethrough className="w-3.5 h-3.5 text-rose-500" />
                      <span>Strike out</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {['#EF4444', '#3B82F6', '#EAB308'].map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            setTextColor(c);
                            setActiveTool('strikeout');
                            setAnnotateMenuOpen(false);
                          }}
                          className="w-3 h-3 rounded-full border border-black cursor-pointer hover:scale-125 transition"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Underline */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveTool('underline');
                        setAnnotateMenuOpen(false);
                      }}
                      className="text-xs font-bold hover:underline cursor-pointer flex items-center gap-1.5"
                    >
                      <Underline className="w-3.5 h-3.5 text-blue-500" />
                      <span>Underline</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {['#EF4444', '#3B82F6', '#EAB308'].map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            setTextColor(c);
                            setActiveTool('underline');
                            setAnnotateMenuOpen(false);
                          }}
                          className="w-3 h-3 rounded-full border border-black cursor-pointer hover:scale-125 transition"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-[2px] bg-slate-200 dark:bg-slate-700 my-0.5" />

              {/* Category FREEHAND */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-wider">
                  Freehand
                </p>
                <div className="flex flex-col gap-1 text-xs">
                  <button
                    onClick={() => {
                      setActiveTool('freehand_highlight');
                      setAnnotateMenuOpen(false);
                    }}
                    className={`p-1.5 rounded-lg flex items-center gap-2 cursor-pointer font-bold ${
                      activeTool === 'freehand_highlight' ? 'bg-amber-100 text-black' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Highlighter className="w-3.5 h-3.5" />
                    <span>Freehand Highlight</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTool('draw');
                      setAnnotateMenuOpen(false);
                    }}
                    className={`p-1.5 rounded-lg flex items-center gap-2 cursor-pointer font-bold ${
                      activeTool === 'draw' ? 'bg-amber-100 text-black' : 'hover:bg-slate-100'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>Draw (Pena Bebas)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 8. SHAPES DROPDOWN */}
        <div className="relative editor-dropdown-container">
          <button
            onClick={() => setShapesMenuOpen(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl border-2 border-black dark:border-white uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              ['rect', 'circle', 'line', 'arrow'].includes(activeTool) || shapesMenuOpen
                ? 'bg-purple-300 text-black shadow-neo-sm ring-2 ring-black'
                : 'bg-white dark:bg-[#181818] hover:bg-purple-100'
            }`}
            title="Bentuk (Kotak, Lingkaran, Garis, Panah)"
          >
            <Shapes className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Shapes</span>
            <ChevronDown className="w-3 h-3 stroke-[3]" />
          </button>

          {shapesMenuOpen && (
            <div className="absolute top-full mt-1.5 left-0 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl shadow-neo p-2 z-50 flex flex-col gap-1 w-40 text-left">
              <button
                onClick={() => { setActiveTool('rect'); setShapesMenuOpen(false); }}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left cursor-pointer font-bold text-xs"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Rectangle</span>
              </button>
              <button
                onClick={() => { setActiveTool('circle'); setShapesMenuOpen(false); }}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left cursor-pointer font-bold text-xs"
              >
                <Circle className="w-3.5 h-3.5" />
                <span>Ellipse</span>
              </button>
              <button
                onClick={() => { setActiveTool('line'); setShapesMenuOpen(false); }}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left cursor-pointer font-bold text-xs"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Line</span>
              </button>
              <button
                onClick={() => { setActiveTool('arrow'); setShapesMenuOpen(false); }}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left cursor-pointer font-bold text-xs"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Arrow</span>
              </button>
            </div>
          )}
        </div>

        {/* 9. Pointer / Deselect */}
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

      {/* FLOATING FIND & REPLACE BAR (SEJDA NEO-BRUTALISM) */}
      {isFindReplaceOpen && (
        <div className="absolute top-28 right-6 z-50 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl p-3.5 shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#FFF] flex flex-col gap-2 w-80 animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-1 border-b-2 border-black dark:border-white">
            <span className="font-black text-xs uppercase flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              <span>Find & Replace</span>
            </span>
            <button
              onClick={() => {
                setIsFindReplaceOpen(false);
                setSearchResults([]);
                setCurrentMatchIndex(-1);
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-1">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchText();
              }}
              placeholder="Cari teks..."
              className="flex-1 bg-slate-100 dark:bg-[#2A2A2A] border-2 border-black dark:border-white rounded-xl px-2.5 py-1 text-xs font-bold outline-none placeholder:text-slate-400"
            />
            <button
              onClick={handleSearchText}
              disabled={isSearching}
              className="px-2.5 py-1 bg-neo-yellow text-black border-2 border-black rounded-xl text-xs font-black shadow-neo-sm hover:scale-102 transition cursor-pointer"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cari'}
            </button>
          </div>

          {/* Replace Input */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Ganti dengan..."
              className="flex-1 bg-slate-100 dark:bg-[#2A2A2A] border-2 border-black dark:border-white rounded-xl px-2.5 py-1 text-xs font-bold outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button
                onClick={handleReplaceCurrent}
                disabled={currentMatchIndex < 0 || searchResults.length === 0}
                className="px-2 py-1 bg-neo-blue text-black border-2 border-black rounded-xl text-[10px] font-black shadow-neo-sm hover:scale-102 transition disabled:opacity-40 cursor-pointer"
              >
                Ganti Ini
              </button>
              <button
                onClick={handleReplaceAll}
                disabled={searchResults.length === 0}
                className="px-2 py-1 bg-neo-green text-black border-2 border-black rounded-xl text-[10px] font-black shadow-neo-sm hover:scale-102 transition disabled:opacity-40 cursor-pointer"
              >
                Ganti Semua
              </button>
            </div>

            {/* Navigation Arrows & Count */}
            {searchResults.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-slate-500">
                  {currentMatchIndex + 1}/{searchResults.length}
                </span>
                <button
                  onClick={handlePrevMatch}
                  className="p-1 border border-black rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <ChevronUp className="w-3 h-3 stroke-[3]" />
                </button>
                <button
                  onClick={handleNextMatch}
                  className="p-1 border border-black rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <ChevronDown className="w-3 h-3 stroke-[3]" />
                </button>
              </div>
            )}
          </div>

          {/* Search Status text */}
          {searchStatus && (
            <p className="text-[10px] font-bold text-slate-500 truncate pt-0.5">
              {searchStatus}
            </p>
          )}
        </div>
      )}

      {/* INLINE TOAST NOTIFICATION */}
      {notification && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-40 bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-2xl px-4 py-2 shadow-neo text-xs font-black animate-in fade-in slide-in-from-top-2">
          {notification}
        </div>
      )}

      {/* MAIN DOCUMENT VIEWPORT WITH SEJDA PER-PAGE CONTROLS */}
      <div className="flex-1 overflow-auto bg-slate-200 dark:bg-[#121212] p-4 sm:p-8 flex flex-col items-center relative">

        {/* PER-PAGE BAR DIRECTLY ATOP THE CURRENT PDF PAGE */}
        <div className="mb-3 flex items-center justify-between gap-3 bg-white dark:bg-[#1E1E1E] border-2 border-black dark:border-white rounded-2xl px-4 py-2 shadow-neo-sm text-xs font-black w-full max-w-2xl z-10">

          {/* Page Indicator & Navigation */}
          <div className="flex items-center gap-2">
            <span className="bg-neo-yellow text-black border border-black px-2.5 py-0.5 rounded-md shadow-neo-sm font-black">
              Hal {currentPage} dari {pages.length}
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
              onClick={() => setCurrentPage(p => Math.min(pages.length, p + 1))}
              disabled={currentPage >= pages.length || isLoadingPdf}
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

            {/* Interactive Overlay Layer for Annotations & Highlight Boxes */}
            <div
              ref={overlayRef}
              onClick={handleOverlayClick}
              onMouseDown={handleFreehandMouseDown}
              className="absolute inset-0 z-10 overflow-visible"
            >
              {/* FIND & REPLACE SEARCH HIGHLIGHT BOXES */}
              {currentMatchesOnThisPage.map((m, idx) => {
                const globalIdx = searchResults.findIndex(r => r === m);
                const isCurrentMatch = globalIdx === currentMatchIndex;

                const screenX = (m.x / naturalDimensions.width) * viewportDimensions.width;
                const screenY = (m.y / naturalDimensions.height) * viewportDimensions.height;
                const screenW = (m.width / naturalDimensions.width) * viewportDimensions.width;
                const screenH = (m.height / naturalDimensions.height) * viewportDimensions.height;

                return (
                  <div
                    key={`search_hl_${idx}`}
                    className={`absolute pointer-events-none transition-all ${
                      isCurrentMatch
                        ? 'bg-orange-400/70 border-2 border-orange-600 ring-2 ring-orange-500 animate-pulse'
                        : 'bg-yellow-300/50 border border-yellow-500'
                    }`}
                    style={{
                      left: screenX,
                      top: screenY,
                      width: screenW,
                      height: screenH
                    }}
                  />
                );
              })}

              {/* ANNOTATIONS LAYER */}
              {showAnnotations && pageAnnotations.map((ann) => {
                const isSelected = selectedAnnId === ann.id;

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

                            {/* Underline */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextUnderline = !ann.isUnderline;
                                setIsUnderline(nextUnderline);
                                const updated = annotations.map(a => (a.id === ann.id ? { ...a, isUnderline: nextUnderline } : a));
                                setAnnotations(updated);
                                pushHistory(updated);
                              }}
                              className={`p-1 rounded cursor-pointer ${ann.isUnderline ? 'bg-neo-yellow text-black font-black' : 'hover:bg-slate-100'}`}
                              title="Garis Bawah (Underline)"
                            >
                              <Underline className="w-3.5 h-3.5 stroke-[3]" />
                            </button>

                            {/* Strikeout */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextStrike = !ann.isStrikeout;
                                setIsStrikeout(nextStrike);
                                const updated = annotations.map(a => (a.id === ann.id ? { ...a, isStrikeout: nextStrike } : a));
                                setAnnotations(updated);
                                pushHistory(updated);
                              }}
                              className={`p-1 rounded cursor-pointer ${ann.isStrikeout ? 'bg-neo-yellow text-black font-black' : 'hover:bg-slate-100'}`}
                              title="Coret Teks (Strikethrough)"
                            >
                              <Strikethrough className="w-3.5 h-3.5 stroke-[3]" />
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

                    {/* 1. Seamless Sejda Text Box */}
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
                          textDecoration: `${ann.isUnderline ? 'underline' : ''} ${ann.isStrikeout ? 'line-through' : ''}`.trim() || 'none',
                          lineHeight: '1.2'
                        }}
                        className="w-full bg-transparent resize-none overflow-hidden outline-none border-none p-0 m-0 font-sans tracking-tight placeholder:text-slate-400 block whitespace-pre-wrap"
                      />
                    )}

                    {/* 2. Whiteout Box */}
                    {ann.type === 'whiteout' && (
                      <div className="w-full h-full bg-white shadow-sm border border-slate-300" />
                    )}

                    {/* 3. Highlight Box */}
                    {ann.type === 'highlight' && (
                      <div
                        className="w-full h-full opacity-60"
                        style={{ backgroundColor: ann.color || '#FFE600' }}
                      />
                    )}

                    {/* 4. Strikeout Line */}
                    {ann.type === 'strikeout' && (
                      <div className="w-full h-full flex items-center">
                        <div
                          className="w-full h-[2.5px]"
                          style={{ backgroundColor: ann.color || '#EF4444' }}
                        />
                      </div>
                    )}

                    {/* 5. Underline Line */}
                    {ann.type === 'underline' && (
                      <div className="w-full h-full flex items-end">
                        <div
                          className="w-full h-[2px]"
                          style={{ backgroundColor: ann.color || '#3B82F6' }}
                        />
                      </div>
                    )}

                    {/* 6. Shape Rect */}
                    {ann.type === 'rect' && (
                      <div
                        className="w-full h-full border-2"
                        style={{ borderColor: ann.color || '#000000' }}
                      />
                    )}

                    {/* 7. Shape Circle */}
                    {ann.type === 'circle' && (
                      <div
                        className="w-full h-full border-2 rounded-full"
                        style={{ borderColor: ann.color || '#000000' }}
                      />
                    )}

                    {/* 8. Shape Line */}
                    {ann.type === 'line' && (
                      <div
                        className="w-full h-[2px]"
                        style={{ backgroundColor: ann.color || '#000000' }}
                      />
                    )}

                    {/* 9. Shape Arrow */}
                    {ann.type === 'arrow' && (
                      <div className="w-full h-full flex items-center relative">
                        <div
                          className="w-full h-[2px]"
                          style={{ backgroundColor: ann.color || '#000000' }}
                        />
                        <div
                          className="absolute right-0 w-0 h-0 border-t-4 border-b-4 border-l-8 border-transparent"
                          style={{ borderLeftColor: ann.color || '#000000' }}
                        />
                      </div>
                    )}

                    {/* 10. Stamp Badge */}
                    {ann.type === 'stamp' && (
                      <div
                        className="w-full h-full border-[3px] rounded-xl flex items-center justify-center font-black tracking-wider uppercase px-2 shadow-neo-sm"
                        style={{
                          borderColor: ann.color || '#DC2626',
                          color: ann.color || '#DC2626',
                          backgroundColor: `${ann.color || '#DC2626'}15`,
                          fontSize: `${Math.max(12, 16 * scale)}px`
                        }}
                      >
                        {ann.stampText || 'STAMP'}
                      </div>
                    )}

                    {/* 11. Form Fields */}
                    {ann.type === 'form' && (
                      <div className="w-full h-full">
                        {ann.formType === 'checkbox' && (
                          <div
                            onClick={(e) => {
                              if (!formEditMode) return;
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
                        {ann.formType === 'radio' && (
                          <div
                            onClick={(e) => {
                              if (!formEditMode) return;
                              e.stopPropagation();
                              const updated = annotations.map(a => (a.id === ann.id ? { ...a, checked: !a.checked } : a));
                              setAnnotations(updated);
                              pushHistory(updated);
                            }}
                            className="w-full h-full border-2 border-black bg-white rounded-full cursor-pointer flex items-center justify-center font-black text-xs"
                          >
                            {ann.checked && <div className="w-2.5 h-2.5 bg-black rounded-full" />}
                          </div>
                        )}
                        {ann.formType === 'text' && (
                          <input
                            type="text"
                            placeholder="Text Field"
                            disabled={!formEditMode}
                            value={ann.text || ''}
                            onChange={(e) => handleTextChange(ann.id, e.target.value)}
                            className="w-full h-full border-2 border-blue-400 bg-blue-50/50 rounded px-1.5 text-xs outline-none"
                          />
                        )}
                        {ann.formType === 'multiline' && (
                          <textarea
                            placeholder="Multiline Field"
                            disabled={!formEditMode}
                            value={ann.text || ''}
                            onChange={(e) => handleTextChange(ann.id, e.target.value)}
                            className="w-full h-full border-2 border-blue-400 bg-blue-50/50 rounded p-1 text-xs outline-none resize-none"
                          />
                        )}
                        {ann.formType === 'dropdown' && (
                          <div className="w-full h-full border-2 border-slate-600 bg-slate-50 rounded px-2 flex items-center justify-between text-xs font-bold">
                            <span>Drop-down list</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {ann.formType === 'signature' && (
                          <div className="w-full h-full border-2 border-dashed border-neo-pink bg-pink-50/50 rounded p-1 flex items-center justify-center text-xs font-black text-pink-700">
                            ✍ Tanda Tangan Di Sini
                          </div>
                        )}
                      </div>
                    )}

                    {/* 12. Freehand strokes */}
                    {ann.type === 'freehand' && ann.points && (
                      <svg
                        className="w-full h-full overflow-visible pointer-events-none"
                        style={{ minWidth: '100%', minHeight: '100%' }}
                      >
                        <polyline
                          points={ann.points
                            .map(p => `${((p.x - ann.x) / naturalDimensions.width) * viewportDimensions.width},${((p.y - ann.y) / naturalDimensions.height) * viewportDimensions.height}`)
                            .join(' ')}
                          fill="none"
                          stroke={ann.color || '#000000'}
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}

                    {/* 13. Hyperlink */}
                    {ann.type === 'link' && (
                      <div className="w-full h-full bg-sky-200/40 border-2 border-dashed border-sky-500 rounded p-1 flex items-center justify-center text-[10px] font-bold text-sky-800">
                        {ann.url}
                      </div>
                    )}

                    {/* 14. Signature or Image Stamp */}
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

              {/* Freehand Live Stroke in Progress */}
              {isDrawing && currentStroke.length > 1 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
                  <polyline
                    points={currentStroke
                      .map(p => `${(p.x / naturalDimensions.width) * viewportDimensions.width},${(p.y / naturalDimensions.height) * viewportDimensions.height}`)
                      .join(' ')}
                    fill="none"
                    stroke={activeTool === 'freehand_highlight' ? '#FACC15' : textColor}
                    strokeWidth={activeTool === 'freehand_highlight' ? 12 : 3}
                    strokeOpacity={activeTool === 'freehand_highlight' ? 0.4 : 1.0}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
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
