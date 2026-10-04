import React, { useRef, useState, useEffect } from 'react';
import { X, RotateCcw, Check, PenTool } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSave
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState<string>('#000000');
  const [penWidth, setPenWidth] = useState<number>(3);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.closePath();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  };

  const colors = [
    { label: 'Hitam', value: '#000000', bg: 'bg-black' },
    { label: 'Biru Dinas', value: '#0B3B8B', bg: 'bg-blue-800' },
    { label: 'Merah', value: '#DC2626', bg: 'bg-red-600' }
  ];

  const widths = [
    { label: 'Tipis', value: 2 },
    { label: 'Sedang', value: 3 },
    { label: 'Tebal', value: 5 }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-3xl p-6 w-full max-w-lg shadow-[8px_8px_0px_#000] dark:shadow-[8px_8px_0px_#FFF] flex flex-col text-black dark:text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-black/10 dark:border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-neo-pink border-2 border-black flex items-center justify-center text-black">
              <PenTool className="w-4 h-4 stroke-[2.5]" />
            </div>
            <h3 className="font-black text-lg uppercase tracking-tight">
              Tanda Tangan Digital
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border-2 border-black dark:border-white bg-slate-100 dark:bg-slate-800 hover:bg-neo-pink flex items-center justify-center font-black transition-colors"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Toolbar Pilihan Warna & Ketebalan */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs font-black">
          {/* Pilihan Warna */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 uppercase mr-1">Tinta:</span>
            {colors.map(c => (
              <button
                key={c.value}
                onClick={() => setPenColor(c.value)}
                className={`w-6 h-6 rounded-full border-2 border-black ${c.bg} flex items-center justify-center transition-transform ${
                  penColor === c.value ? 'scale-125 ring-2 ring-neo-yellow' : 'hover:scale-110'
                }`}
                title={c.label}
              >
                {penColor === c.value && <Check className="w-3 h-3 text-white stroke-[3]" />}
              </button>
            ))}
          </div>

          {/* Pilihan Ketebalan */}
          <div className="flex items-center gap-1">
            <span className="text-slate-500 dark:text-slate-400 uppercase mr-1">Garis:</span>
            {widths.map(w => (
              <button
                key={w.value}
                onClick={() => setPenWidth(w.value)}
                className={`px-2 py-0.5 rounded-lg border-2 border-black text-xs uppercase font-black transition-all ${
                  penWidth === w.value
                    ? 'bg-neo-yellow text-black shadow-neo-sm'
                    : 'bg-white dark:bg-[#2A2A2A] text-slate-700 dark:text-slate-300'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Area */}
        <div className="relative border-2 border-dashed border-black/40 dark:border-white/40 rounded-2xl bg-white overflow-hidden shadow-inner touch-none">
          <canvas
            ref={canvasRef}
            width={520}
            height={240}
            className="w-full h-48 sm:h-56 cursor-crosshair block"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {!hasDrawn && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
              Goreskan tanda tangan Anda di sini
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t-2 border-black/10 dark:border-white/10">
          <button
            type="button"
            onClick={clearCanvas}
            className="px-4 py-2 border-2 border-black dark:border-white rounded-xl bg-slate-100 dark:bg-[#2A2A2A] hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5"
          >
            <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Bersihkan</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-black dark:border-white rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-black uppercase"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!hasDrawn}
              className={`px-5 py-2 border-2 border-black dark:border-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-neo ${
                hasDrawn
                  ? 'bg-neo-green text-black hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed border-dashed'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Gunakan Tanda Tangan</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
