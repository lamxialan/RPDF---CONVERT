import React, { useRef, useState, useEffect } from 'react';
import { X, RotateCcw, Check, PenTool, Type, Upload } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

type SignatureTab = 'draw' | 'type' | 'upload';

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<SignatureTab>('draw');

  // Tab 1: Draw State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState<string>('#000000');
  const [penWidth, setPenWidth] = useState<number>(3);

  // Tab 2: Type State
  const [typedName, setTypedName] = useState<string>('');
  const [selectedFont, setSelectedFont] = useState<'Dancing Script' | 'Caveat' | 'cursive'>('Dancing Script');
  const [typedColor, setTypedColor] = useState<string>('#000000');

  // Tab 3: Upload State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [makeTransparent, setMakeTransparent] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // ---------------- DRAW TAB HELPERS ----------------
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

  // ---------------- SAVE ACTION HANDLERS ----------------
  const handleSave = () => {
    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      onSave(canvas.toDataURL('image/png'));
      onClose();
    } else if (activeTab === 'type') {
      if (!typedName.trim()) return;
      // Render typed text to offscreen canvas
      const offscreen = document.createElement('canvas');
      offscreen.width = 600;
      offscreen.height = 200;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, offscreen.width, offscreen.height);
      ctx.fillStyle = typedColor;
      ctx.font = `64px '${selectedFont}', cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName.trim(), offscreen.width / 2, offscreen.height / 2);

      onSave(offscreen.toDataURL('image/png'));
      onClose();
    } else if (activeTab === 'upload') {
      if (!uploadedImage) return;

      if (!makeTransparent) {
        onSave(uploadedImage);
        onClose();
        return;
      }

      // Convert white pixels to transparent
      const img = new Image();
      img.onload = () => {
        const offscreen = document.createElement('canvas');
        offscreen.width = img.width;
        offscreen.height = img.height;
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
          onSave(uploadedImage);
          onClose();
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // If close to white (> 225)
          if (r > 220 && g > 220 && b > 220) {
            data[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        onSave(offscreen.toDataURL('image/png'));
        onClose();
      };
      img.src = uploadedImage;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) setUploadedImage(dataUrl);
    };
    reader.readAsDataURL(file);
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

  const canSave =
    (activeTab === 'draw' && hasDrawn) ||
    (activeTab === 'type' && typedName.trim().length > 0) ||
    (activeTab === 'upload' && uploadedImage !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-3xl p-6 w-full max-w-lg shadow-[8px_8px_0px_#000] dark:shadow-[8px_8px_0px_#FFF] flex flex-col text-black dark:text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-black/10 dark:border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-neo-pink border-2 border-black flex items-center justify-center text-black">
              <PenTool className="w-4 h-4 stroke-[2.5]" />
            </div>
            <h3 className="font-black text-lg uppercase tracking-tight">
              Tanda Tangan & Inisial
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border-2 border-black dark:border-white bg-slate-100 dark:bg-slate-800 hover:bg-neo-pink flex items-center justify-center font-black transition-colors"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* 3 Neo-Brutalist Tabs */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('draw')}
            className={`py-2 px-3 border-2 border-black dark:border-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'draw'
                ? 'bg-neo-yellow text-black shadow-neo-sm translate-x-[-1px] translate-y-[-1px]'
                : 'bg-slate-100 dark:bg-[#2A2A2A] text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <PenTool className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Gambar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('type')}
            className={`py-2 px-3 border-2 border-black dark:border-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'type'
                ? 'bg-neo-blue text-black shadow-neo-sm translate-x-[-1px] translate-y-[-1px]'
                : 'bg-slate-100 dark:bg-[#2A2A2A] text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Type className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Ketik</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`py-2 px-3 border-2 border-black dark:border-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'upload'
                ? 'bg-neo-green text-black shadow-neo-sm translate-x-[-1px] translate-y-[-1px]'
                : 'bg-slate-100 dark:bg-[#2A2A2A] text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Unggah</span>
          </button>
        </div>

        {/* TAB 1: GAMBAR (DRAW) */}
        {activeTab === 'draw' && (
          <div>
            {/* Toolbar Warna & Ketebalan */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs font-black">
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
                height={220}
                className="w-full h-44 sm:h-52 cursor-crosshair block"
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
          </div>
        )}

        {/* TAB 2: KETIK (TYPE) */}
        {activeTab === 'type' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                Ketik Nama / Inisial:
              </label>
              <input
                type="text"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder="Contoh: Budi Santoso / BS"
                className="w-full border-2 border-black dark:border-white rounded-xl px-4 py-2.5 bg-white dark:bg-[#252525] font-black text-sm text-black dark:text-white shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-neo-blue"
              />
            </div>

            {/* Pilihan Gaya Huruf & Warna */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-black">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400 uppercase mr-1">Font:</span>
                {(['Dancing Script', 'Caveat', 'cursive'] as const).map(font => (
                  <button
                    key={font}
                    onClick={() => setSelectedFont(font)}
                    className={`px-3 py-1 border-2 border-black dark:border-white rounded-xl transition-all ${
                      selectedFont === font
                        ? 'bg-neo-yellow text-black shadow-neo-sm'
                        : 'bg-white dark:bg-[#2A2A2A] text-slate-700 dark:text-slate-300'
                    }`}
                    style={{ fontFamily: `'${font}', cursive` }}
                  >
                    {font === 'cursive' ? 'Klasik' : font}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400 uppercase mr-1">Warna:</span>
                {colors.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setTypedColor(c.value)}
                    className={`w-6 h-6 rounded-full border-2 border-black ${c.bg} flex items-center justify-center transition-transform ${
                      typedColor === c.value ? 'scale-125 ring-2 ring-neo-blue' : 'hover:scale-110'
                    }`}
                  >
                    {typedColor === c.value && <Check className="w-3 h-3 text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview Box */}
            <div className="border-2 border-dashed border-black/40 dark:border-white/40 rounded-2xl bg-white p-6 min-h-[140px] flex items-center justify-center overflow-hidden shadow-inner">
              {typedName.trim() ? (
                <span
                  style={{
                    fontFamily: `'${selectedFont}', cursive`,
                    color: typedColor,
                    fontSize: '44px',
                    lineHeight: '1.2'
                  }}
                  className="tracking-wide select-none"
                >
                  {typedName}
                </span>
              ) : (
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Pratinjau tulisan tanda tangan akan muncul di sini
                </span>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: UNGGAH (UPLOAD) */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />

            {!uploadedImage ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-black/50 dark:border-white/50 rounded-2xl p-8 bg-slate-50 dark:bg-[#252525] hover:bg-slate-100 dark:hover:bg-[#2c2c2c] transition-colors flex flex-col items-center justify-center gap-2.5 cursor-pointer text-center"
              >
                <div className="w-12 h-12 rounded-2xl bg-neo-yellow border-2 border-black flex items-center justify-center shadow-neo-sm text-black">
                  <Upload className="w-6 h-6 stroke-[2.5]" />
                </div>
                <p className="text-xs font-black uppercase text-black dark:text-white">
                  Pilih Foto Tanda Tangan / Paraf
                </p>
                <p className="text-[11px] font-bold text-slate-500">
                  Dukung format PNG transparan, JPG, atau WebP (Maks 10MB)
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative border-2 border-black dark:border-white rounded-2xl bg-slate-100 dark:bg-[#252525] p-4 flex items-center justify-center min-h-[140px] overflow-hidden">
                  <img
                    src={uploadedImage}
                    alt="Signature Upload"
                    className="max-h-36 max-w-full object-contain filter drop-shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setUploadedImage(null)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 border-2 border-black text-white flex items-center justify-center font-black shadow-neo-sm hover:scale-110"
                    title="Ganti Foto"
                  >
                    <X className="w-4 h-4 stroke-[3]" />
                  </button>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-black">
                  <input
                    type="checkbox"
                    checked={makeTransparent}
                    onChange={e => setMakeTransparent(e.target.checked)}
                    className="w-4 h-4 accent-neo-blue rounded"
                  />
                  <span>Hapus latar belakang putih otomatis (Transparan)</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t-2 border-black/10 dark:border-white/10">
          {activeTab === 'draw' ? (
            <button
              type="button"
              onClick={clearCanvas}
              className="px-4 py-2 border-2 border-black dark:border-white rounded-xl bg-slate-100 dark:bg-[#2A2A2A] hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-black uppercase flex items-center gap-1.5 shadow-neo-sm active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Bersihkan</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-black dark:border-white rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-black uppercase cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`px-5 py-2 border-2 border-black dark:border-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-neo ${
                canSave
                  ? 'bg-neo-green text-black hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer'
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
