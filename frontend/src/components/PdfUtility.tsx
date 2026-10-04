import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Download,
  Trash2,
  Layers,
  Minimize2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  X,
  FileText,
  Scissors,
  Lock,
  Unlock,
  Stamp,
  Hash,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { getApiUrl } from '../config/api';
import { PdfToolMode } from '../types';

interface PdfUtilityProps {
  initialMode?: PdfToolMode;
}

interface ToolConfig {
  id: PdfToolMode;
  name: string;
  badge: string;
  desc: string;
  color: string;
  borderColor: string;
  icon: React.ReactNode;
  multiple: boolean;
}

export const PdfUtility: React.FC<PdfUtilityProps> = ({ initialMode = 'to-docx' }) => {
  const [activeMode, setActiveMode] = useState<PdfToolMode>(initialMode);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('document.pdf');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Form inputs khusus
  const [pageRange, setPageRange] = useState<string>('1-end');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // Watermark inputs
  const [watermarkText, setWatermarkText] = useState<string>('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.25);
  const [watermarkRotation, setWatermarkRotation] = useState<number>(45);
  const [watermarkColor, setWatermarkColor] = useState<string>('#666666');

  // Page Numbers inputs
  const [pageNumberPosition, setPageNumberPosition] = useState<string>('bottom-center');
  const [pageNumberFormat, setPageNumberFormat] = useState<string>('Halaman {n} dari {total}');
  const [pageNumberStart, setPageNumberStart] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialMode) {
      setActiveMode(initialMode);
    }
  }, [initialMode]);

  // Reset file jika berpindah mode yang single vs multiple
  const handleModeSwitch = (mode: PdfToolMode) => {
    setActiveMode(mode);
    setDownloadUrl(null);
    setSuccessMessage(null);
    setAlertMessage(null);
    if (mode !== 'merge' && files.length > 1) {
      setFiles([files[0]]);
    }
  };

  const tools: ToolConfig[] = [
    {
      id: 'to-docx',
      name: 'PDF ke Word',
      badge: 'POPULER',
      desc: 'Ubah PDF menjadi file Word (.docx) yang dapat diedit.',
      color: 'bg-neo-blue',
      borderColor: 'border-blue-900',
      icon: <FileText className="w-4 h-4 stroke-[2.5]" />,
      multiple: false
    },
    {
      id: 'split',
      name: 'Split PDF',
      badge: 'EKSTRAK',
      desc: 'Pecah atau ekstrak halaman tertentu (misal: 1-3, 5).',
      color: 'bg-neo-yellow',
      borderColor: 'border-yellow-900',
      icon: <Scissors className="w-4 h-4 stroke-[2.5]" />,
      multiple: false
    },
    {
      id: 'merge',
      name: 'Gabungkan PDF',
      badge: 'BATCH',
      desc: 'Satukan beberapa file PDF menjadi satu file berurutan.',
      color: 'bg-neo-green',
      borderColor: 'border-emerald-900',
      icon: <Layers className="w-4 h-4 stroke-[2.5]" />,
      multiple: true
    },
    {
      id: 'compress',
      name: 'Kompres PDF',
      badge: 'HEMAT RUANG',
      desc: 'Kecilkan ukuran dokumen tanpa merusak kualitas teks.',
      color: 'bg-neo-purple',
      borderColor: 'border-purple-900',
      icon: <Minimize2 className="w-4 h-4 stroke-[2.5]" />,
      multiple: false
    },
    {
      id: 'protect',
      name: 'Kunci PDF',
      badge: 'KEAMANAN',
      desc: 'Pasang password enkripsi pada dokumen PDF.',
      color: 'bg-neo-pink',
      borderColor: 'border-pink-900',
      icon: <Lock className="w-4 h-4 stroke-[2.5]" />,
      multiple: false
    },
    {
      id: 'unlock',
      name: 'Buka Kunci',
      badge: 'DEKRIPSI',
      desc: 'Hilangkan password dari dokumen PDF yang terkunci.',
      color: 'bg-emerald-300',
      borderColor: 'border-emerald-900',
      icon: <Unlock className="w-4 h-4 stroke-[2.5]" />,
      multiple: false
    },
    {
      id: 'watermark',
      name: 'Watermark',
      badge: 'HAK CIPTA',
      desc: 'Bubuhkan teks cap air semi-transparan diagonal.',
      color: 'bg-orange-300',
      borderColor: 'border-orange-900',
      icon: <Stamp className="w-4 h-4 stroke-[2.5]" />,
      multiple: false
    },
    {
      id: 'page-numbers',
      name: 'Nomor Halaman',
      badge: 'RAPAT RESMI',
      desc: 'Tambahkan penomoran halaman otomatis di posisi presisi.',
      color: 'bg-sky-300',
      borderColor: 'border-sky-900',
      icon: <Hash className="w-4 h-4 stroke-[2.5]" />,
      multiple: false
    }
  ];

  const currentTool = tools.find(t => t.id === activeMode) || tools[0];

  const handleFiles = (incoming: FileList | File[]) => {
    const valid: File[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i];
      if (!f.name.toLowerCase().endsWith('.pdf')) {
        setAlertMessage(`File "${f.name}" bukan PDF. Modul ini hanya memproses dokumen .pdf.`);
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        setAlertMessage(`File "${f.name}" melebihi batas ukuran 25MB.`);
        continue;
      }
      valid.push(f);
    }

    if (currentTool.multiple) {
      setFiles(prev => [...prev, ...valid]);
    } else {
      if (valid.length > 0) {
        setFiles([valid[0]]);
      }
    }
    setDownloadUrl(null);
    setSuccessMessage(null);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setDownloadUrl(null);
  };

  const clearAll = () => {
    setFiles([]);
    setDownloadUrl(null);
    setSuccessMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeAction = async () => {
    if (files.length === 0) {
      setAlertMessage('Silakan pilih atau unggah dokumen PDF terlebih dahulu.');
      return;
    }

    if (activeMode === 'merge' && files.length < 2) {
      setAlertMessage('Minimal butuh 2 file PDF untuk digabungkan.');
      return;
    }

    if ((activeMode === 'protect' || activeMode === 'unlock') && !password.trim()) {
      setAlertMessage('Masukkan kata sandi (password) untuk melanjutkan.');
      return;
    }

    setIsProcessing(true);
    setAlertMessage(null);
    setDownloadUrl(null);

    const formData = new FormData();

    let endpoint = '';

    switch (activeMode) {
      case 'to-docx':
        endpoint = '/api/pdf/to-docx';
        formData.append('file', files[0]);
        break;

      case 'split':
        endpoint = '/api/pdf/split';
        formData.append('file', files[0]);
        formData.append('page_range', pageRange || '1-end');
        break;

      case 'merge':
        endpoint = '/api/pdf/merge';
        files.forEach(f => formData.append('files', f));
        break;

      case 'compress':
        endpoint = '/api/pdf/compress';
        formData.append('file', files[0]);
        break;

      case 'protect':
        endpoint = '/api/pdf/protect';
        formData.append('file', files[0]);
        formData.append('password', password);
        break;

      case 'unlock':
        endpoint = '/api/pdf/unlock';
        formData.append('file', files[0]);
        formData.append('password', password);
        break;

      case 'watermark':
        endpoint = '/api/pdf/watermark';
        formData.append('file', files[0]);
        formData.append('text', watermarkText || 'CONFIDENTIAL');
        formData.append('opacity', watermarkOpacity.toString());
        formData.append('rotation', watermarkRotation.toString());
        formData.append('font_size', '48');
        formData.append('color', watermarkColor);
        break;

      case 'page-numbers':
        endpoint = '/api/pdf/page-numbers';
        formData.append('file', files[0]);
        formData.append('position', pageNumberPosition);
        formData.append('format_template', pageNumberFormat || 'Halaman {n} dari {total}');
        formData.append('start_number', pageNumberStart.toString());
        break;
    }

    try {
      const res = await fetch(getApiUrl(endpoint), {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Gagal memproses dokumen PDF' }));
        throw new Error(err.detail || 'Gagal memproses dokumen PDF.');
      }

      const data = await res.json();
      setDownloadUrl(getApiUrl(data.download_url));
      setDownloadName(data.download_name || 'document.pdf');
      setSuccessMessage(data.message || 'Pemrosesan dokumen PDF berhasil!');
    } catch (err: any) {
      setAlertMessage(err.message || 'Terjadi kesalahan sistem saat memproses dokumen.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      
      {/* Alert Error Box */}
      {alertMessage && (
        <div className="mb-6 p-4 bg-neo-yellow border-[3px] border-black rounded-2xl shadow-neo flex items-center justify-between gap-3 text-black animate-shake">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-black">
            <AlertCircle className="w-5 h-5 text-black stroke-[3] flex-shrink-0" />
            <span>{alertMessage}</span>
          </div>
          <button
            onClick={() => setAlertMessage(null)}
            className="p-1 bg-white border-2 border-black rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Tool Navigation Bar (Neo-Brutalist Grid Buttons) */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black">
            <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>PILIH MODUL ALAT PDF</span>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-white border border-black px-2 py-0.5 rounded-md shadow-neo-sm">
            8 FITUR LENGKAP
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {tools.map(tool => {
            const isSelected = activeMode === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => handleModeSwitch(tool.id)}
                className={`p-3 border-2 border-black rounded-2xl text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? `${tool.color} shadow-neo translate-x-[-1px] translate-y-[-1px] ring-2 ring-black`
                    : 'bg-white hover:bg-slate-100 shadow-neo-sm hover:shadow-neo'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-7 h-7 bg-white border border-black rounded-lg flex items-center justify-center shadow-neo-sm">
                    {tool.icon}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-black text-white px-1.5 py-0.5 rounded">
                    {tool.badge}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-black leading-tight">
                    {tool.name}
                  </h4>
                  <p className="text-[11px] font-bold text-slate-700 truncate mt-0.5">
                    {tool.id === 'to-docx' ? '.docx editable' : tool.id === 'split' ? 'Range halaman' : tool.id === 'protect' ? 'AES-128 enkripsi' : tool.id === 'unlock' ? 'Buka password' : tool.id === 'watermark' ? 'Cap transparan' : tool.id === 'page-numbers' ? 'Otomatis' : tool.id === 'merge' ? 'Multi dokumen' : 'Kompresi ringan'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-white border-[3px] border-black rounded-3xl shadow-neo-lg p-6 sm:p-10 relative overflow-hidden">
        
        {/* Tool Header */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center gap-1.5 ${currentTool.color} text-black border-2 border-black rounded-full font-black uppercase text-xs px-4 py-1 shadow-neo-sm mb-3`}>
            {currentTool.icon}
            <span>MODUL {currentTool.name}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-black uppercase">
            {currentTool.name}
          </h2>
          <p className="mt-2 text-xs sm:text-sm font-bold text-slate-700 max-w-xl mx-auto">
            {currentTool.desc}
          </p>
        </div>

        {/* Dynamic Tool Specific Configuration / Inputs */}
        <div className="mb-6">

          {/* Mode 1: PDF to Word Info Badge */}
          {activeMode === 'to-docx' && (
            <div className="bg-blue-50 border-2 border-black rounded-2xl p-4 shadow-neo-sm flex items-start gap-3 text-black">
              <ShieldCheck className="w-5 h-5 text-blue-700 stroke-[2.5] flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-black uppercase tracking-wide">Google Docs & Microsoft Word Ready</p>
                <p className="font-bold text-slate-700 mt-0.5 leading-relaxed">
                  Menghasilkan file .docx dengan tata letak paragraf terstruktur dan gambar sRGB tanpa broken-image saat dibuka di Google Dokumen.
                </p>
              </div>
            </div>
          )}

          {/* Mode 2: Split PDF Page Range Input */}
          {activeMode === 'split' && (
            <div className="bg-[#FFFDF5] border-2 border-black rounded-2xl p-4 sm:p-5 shadow-neo-sm">
              <label className="block text-xs font-black uppercase tracking-wider text-black mb-2">
                Tentukan Rentang / Nomor Halaman Yang Ingin Diekstrak:
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={pageRange}
                  onChange={e => setPageRange(e.target.value)}
                  placeholder="Contoh: 1-3, 5, 8-10"
                  className="flex-1 bg-white border-2 border-black rounded-xl px-4 py-2.5 text-sm font-black text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neo-yellow shadow-neo-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPageRange('1-end')}
                    className="px-3 py-2 bg-neo-yellow border-2 border-black rounded-xl text-xs font-black shadow-neo-sm hover:bg-yellow-300 transition"
                  >
                    Semua (1-end)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageRange('1')}
                    className="px-3 py-2 bg-white border-2 border-black rounded-xl text-xs font-black shadow-neo-sm hover:bg-slate-100 transition"
                  >
                    Hal. 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageRange('1-5')}
                    className="px-3 py-2 bg-white border-2 border-black rounded-xl text-xs font-black shadow-neo-sm hover:bg-slate-100 transition"
                  >
                    1 - 5
                  </button>
                </div>
              </div>
              <p className="text-[11px] font-bold text-slate-600 mt-2">
                Format: Pisahkan dengan tanda koma (,) untuk halaman acak atau tanda hubung (-) untuk rentang (contoh: <code className="bg-white border border-black px-1 rounded">1-4, 7</code>).
              </p>
            </div>
          )}

          {/* Mode 3: Protect PDF (Password Input) */}
          {activeMode === 'protect' && (
            <div className="bg-pink-50 border-2 border-black rounded-2xl p-4 sm:p-5 shadow-neo-sm">
              <label className="block text-xs font-black uppercase tracking-wider text-black mb-2">
                Masukkan Kata Sandi (Password) Penguncian Dokumen:
              </label>
              <div className="relative max-w-md">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Ketik password baru..."
                  className="w-full bg-white border-2 border-black rounded-xl px-4 py-2.5 pr-12 text-sm font-black text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neo-pink shadow-neo-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-700 hover:text-black"
                >
                  {showPassword ? <EyeOff className="w-4 h-4 stroke-[2.5]" /> : <Eye className="w-4 h-4 stroke-[2.5]" />}
                </button>
              </div>
              <p className="text-[11px] font-bold text-slate-600 mt-2">
                Dokumen akan dienkripsi dengan standar AES 128-bit. Pastikan Anda mengingat password ini karena tidak ada opsi pemulihan.
              </p>
            </div>
          )}

          {/* Mode 4: Unlock PDF (Password Input) */}
          {activeMode === 'unlock' && (
            <div className="bg-emerald-50 border-2 border-black rounded-2xl p-4 sm:p-5 shadow-neo-sm">
              <label className="block text-xs font-black uppercase tracking-wider text-black mb-2">
                Masukkan Kata Sandi Dokumen PDF Saat Ini:
              </label>
              <div className="relative max-w-md">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Ketik password pembuka..."
                  className="w-full bg-white border-2 border-black rounded-xl px-4 py-2.5 pr-12 text-sm font-black text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neo-green shadow-neo-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-700 hover:text-black"
                >
                  {showPassword ? <EyeOff className="w-4 h-4 stroke-[2.5]" /> : <Eye className="w-4 h-4 stroke-[2.5]" />}
                </button>
              </div>
              <p className="text-[11px] font-bold text-slate-600 mt-2">
                Setelah proteksi dibuka, PDF dapat dibaca, diedit, dan dicetak tanpa perlu memasukkan password lagi.
              </p>
            </div>
          )}

          {/* Mode 5: Watermark Inputs */}
          {activeMode === 'watermark' && (
            <div className="bg-amber-50 border-2 border-black rounded-2xl p-4 sm:p-5 shadow-neo-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Teks Watermark */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-black mb-2">
                    Teks Cap Watermark:
                  </label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={e => setWatermarkText(e.target.value)}
                    placeholder="Contoh: CONFIDENTIAL / RAHASIA"
                    className="w-full bg-white border-2 border-black rounded-xl px-4 py-2 text-sm font-black text-black shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-neo-yellow"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['CONFIDENTIAL', 'DRAFT', 'SALINAN RESMI', 'TOP SECRET'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setWatermarkText(preset)}
                        className="text-[10px] font-black bg-white border border-black px-2 py-0.5 rounded shadow-neo-sm hover:bg-neo-yellow"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pengaturan Visual Watermark */}
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Transparansi (Opacity):</span>
                      <span className="font-mono">{Math.round(watermarkOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.8"
                      step="0.05"
                      value={watermarkOpacity}
                      onChange={e => setWatermarkOpacity(parseFloat(e.target.value))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Sudut Putar (Rotasi):</span>
                      <span className="font-mono">{watermarkRotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="5"
                      value={watermarkRotation}
                      onChange={e => setWatermarkRotation(parseInt(e.target.value, 10))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  {/* Warna Cap Watermark */}
                  <div>
                    <span className="block text-xs font-black uppercase text-black mb-1.5">
                      Pilihan Warna:
                    </span>
                    <div className="flex items-center gap-2">
                      {[
                        { label: 'Abu-abu', hex: '#666666', bg: 'bg-neutral-600' },
                        { label: 'Merah', hex: '#DC2626', bg: 'bg-red-600' },
                        { label: 'Biru', hex: '#2563EB', bg: 'bg-blue-600' },
                        { label: 'Hijau', hex: '#16A34A', bg: 'bg-green-600' }
                      ].map(c => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setWatermarkColor(c.hex)}
                          className={`w-7 h-7 rounded-lg border-2 border-black ${c.bg} flex items-center justify-center transition-all ${
                            watermarkColor === c.hex ? 'scale-110 ring-2 ring-black shadow-neo-sm' : 'opacity-80 hover:opacity-100'
                          }`}
                          title={c.label}
                        >
                          {watermarkColor === c.hex && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            </div>
          )}

          {/* Mode 6: Page Numbers Inputs */}
          {activeMode === 'page-numbers' && (
            <div className="bg-sky-50 border-2 border-black rounded-2xl p-4 sm:p-5 shadow-neo-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                
                {/* Posisi Nomor */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-black mb-2">
                    Posisi Nomor Halaman:
                  </label>
                  <select
                    value={pageNumberPosition}
                    onChange={e => setPageNumberPosition(e.target.value)}
                    className="w-full bg-white border-2 border-black rounded-xl px-3 py-2 text-xs font-black text-black shadow-neo-sm focus:outline-none"
                  >
                    <option value="bottom-center">Bawah Tengah (Rekomendasi)</option>
                    <option value="bottom-right">Bawah Kanan</option>
                    <option value="top-right">Atas Kanan</option>
                    <option value="bottom-left">Bawah Kiri</option>
                  </select>
                </div>

                {/* Format Template */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-black mb-2">
                    Format Teks:
                  </label>
                  <input
                    type="text"
                    value={pageNumberFormat}
                    onChange={e => setPageNumberFormat(e.target.value)}
                    placeholder="Halaman {n} dari {total}"
                    className="w-full bg-white border-2 border-black rounded-xl px-3 py-2 text-xs font-black text-black shadow-neo-sm focus:outline-none"
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setPageNumberFormat('{n} / {total}')}
                      className="text-[10px] font-black bg-white border border-black px-2 py-0.5 rounded hover:bg-neo-yellow"
                    >
                      {'{n} / {total}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageNumberFormat('Hal. {n}')}
                      className="text-[10px] font-black bg-white border border-black px-2 py-0.5 rounded hover:bg-neo-yellow"
                    >
                      Hal. {'{n}'}
                    </button>
                  </div>
                </div>

                {/* Angka Awal */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-black mb-2">
                    Mulai Dari Angka:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={pageNumberStart}
                    onChange={e => setPageNumberStart(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-white border-2 border-black rounded-xl px-3 py-2 text-xs font-black text-black shadow-neo-sm focus:outline-none"
                  />
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Drop Zone Box */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
          onDrop={e => { e.preventDefault(); setIsDragging(false); e.dataTransfer.files && handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-[3px] border-black border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
            isDragging
              ? `${currentTool.color} scale-[1.01]`
              : 'bg-[#FFFDF8] hover:bg-slate-50'
          }`}
        >
          <div className={`w-16 h-16 mx-auto mb-4 ${currentTool.color} border-2 border-black rounded-2xl flex items-center justify-center shadow-neo-sm`}>
            <UploadCloud className="w-8 h-8 text-black stroke-[2.5]" />
          </div>
          <p className="text-sm sm:text-base font-black text-black">
            Tarik & Lepas file PDF ke sini, atau <span className="bg-neo-yellow px-2.5 py-1 border border-black rounded-lg underline">Pilih Dokumen PDF</span>
          </p>
          <p className="mt-2 text-xs font-bold text-slate-600">
            {currentTool.multiple
              ? 'Unggah minimal 2 file PDF untuk digabungkan (Maks. 25MB per file)'
              : 'Unggah 1 file dokumen PDF (Maks. 25MB)'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple={currentTool.multiple}
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
            accept=".pdf"
          />
        </div>

        {/* Files Selected List */}
        {files.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3 text-xs font-black uppercase text-black">
              <span>{currentTool.multiple ? `Daftar Dokumen PDF (${files.length})` : 'Dokumen PDF Terpilih'}</span>
              <button
                onClick={clearAll}
                disabled={isProcessing}
                className="text-rose-600 hover:underline flex items-center gap-1 cursor-pointer font-black"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Reset</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {files.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="bg-white border-2 border-black rounded-2xl p-4 flex items-center justify-between gap-4 shadow-neo-sm"
                >
                  <div className="flex items-center gap-3.5 overflow-hidden flex-1">
                    <div className="w-10 h-10 bg-neo-yellow border-2 border-black rounded-xl flex items-center justify-center flex-shrink-0 shadow-neo-sm">
                      <FileText className="w-5 h-5 text-black stroke-[2.5]" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-black text-black truncate" title={file.name}>
                        {currentTool.multiple && (
                          <span className="bg-neo-blue border border-black rounded-md px-2 py-0.5 mr-2 font-mono text-xs">
                            #{idx + 1}
                          </span>
                        )}
                        {file.name}
                      </p>
                      <p className="text-xs font-bold text-slate-600 mt-0.5">{formatFileSize(file.size)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => removeFile(idx)}
                    disabled={isProcessing}
                    className="p-2 border border-black rounded-xl hover:bg-rose-200 transition cursor-pointer"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4 text-black" />
                  </button>
                </div>
              ))}
            </div>

            {/* Action CTA Button */}
            <div className="mt-6 pt-5 border-t-[3px] border-black flex items-center justify-end gap-3">
              <button
                onClick={executeAction}
                disabled={isProcessing || (currentTool.multiple && files.length < 2)}
                className={`px-6 py-3 ${currentTool.color} border-2 border-black rounded-xl font-black text-xs sm:text-sm shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black stroke-[3]" />
                    <span>SEDANG MEMPROSES...</span>
                  </>
                ) : (
                  <>
                    {currentTool.icon}
                    <span>
                      {activeMode === 'to-docx'
                        ? 'KONVERSI KE WORD (.DOCX)'
                        : activeMode === 'split'
                        ? 'EKSTRAK HALAMAN SEKARANG'
                        : activeMode === 'merge'
                        ? `GABUNGKAN ${files.length} DOKUMEN PDF`
                        : activeMode === 'compress'
                        ? 'MULAI KOMPRESI PDF'
                        : activeMode === 'protect'
                        ? 'KUNCI DOKUMEN DENGAN PASSWORD'
                        : activeMode === 'unlock'
                        ? 'BUKA PROTEKSI PASSWORD'
                        : activeMode === 'watermark'
                        ? 'BUBUHKAN WATERMARK TEKS'
                        : 'TERAPKAN NOMOR HALAMAN'}
                    </span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </>
                )}
              </button>
            </div>

            {/* Success Download Card */}
            {downloadUrl && (
              <div className="mt-6 p-5 sm:p-6 bg-neo-green border-[3px] border-black rounded-2xl shadow-neo flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-3.5 text-black">
                  <div className="w-10 h-10 bg-white border-2 border-black rounded-xl flex items-center justify-center flex-shrink-0 shadow-neo-sm">
                    <CheckCircle2 className="w-6 h-6 stroke-[3] text-black" />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase">
                      {successMessage || 'Proses Berhasil!'}
                    </p>
                    <p className="text-xs font-bold mt-0.5 text-slate-800">
                      File siap diunduh: <span className="font-mono underline">{downloadName}</span>
                    </p>
                  </div>
                </div>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="w-full sm:w-auto px-6 py-3 bg-white border-2 border-black rounded-xl text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-neo hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-sm transition-all"
                >
                  <Download className="w-4 h-4 stroke-[3]" />
                  <span>UNDUH FILE HASIL</span>
                </a>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
