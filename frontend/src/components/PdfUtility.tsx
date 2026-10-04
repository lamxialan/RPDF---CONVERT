import React, { useState, useRef } from 'react';
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
  FileText
} from 'lucide-react';

interface PdfUtilityProps {
  mode: 'merge' | 'compress';
}

export const PdfUtility: React.FC<PdfUtilityProps> = ({ mode }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | File[]) => {
    const valid: File[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i];
      if (!f.name.toLowerCase().endsWith('.pdf')) {
        setAlertMessage(`File "${f.name}" bukan PDF. Hanya menerima .pdf.`);
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        setAlertMessage(`File "${f.name}" melebihi batas 25MB.`);
        continue;
      }
      valid.push(f);
    }

    if (mode === 'compress') {
      if (valid.length > 0) {
        setFiles([valid[0]]);
        setDownloadUrl(null);
      }
    } else {
      setFiles(prev => [...prev, ...valid]);
      setDownloadUrl(null);
    }
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setDownloadUrl(null);
  };

  const clearAll = () => {
    setFiles([]);
    setDownloadUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processUtility = async () => {
    if (mode === 'merge' && files.length < 2) {
      setAlertMessage('Minimal butuh 2 file PDF untuk digabungkan.');
      return;
    }
    if (mode === 'compress' && files.length === 0) {
      setAlertMessage('Pilih 1 file PDF untuk dikompres.');
      return;
    }

    setIsProcessing(true);
    setAlertMessage(null);

    const formData = new FormData();
    if (mode === 'merge') {
      files.forEach(f => formData.append('files', f));
    } else {
      formData.append('file', files[0]);
    }

    const endpoint = mode === 'merge' ? '/api/pdf/merge' : '/api/pdf/compress';

    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Gagal memproses PDF' }));
        throw new Error(err.detail || 'Gagal memproses PDF');
      }
      const data = await res.json();
      setDownloadUrl(data.download_url);
    } catch (err: any) {
      setAlertMessage(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const accentColor = mode === 'merge' ? 'bg-neo-blue' : 'bg-neo-yellow';

  return (
    <div className="w-full max-w-4xl mx-auto">
      
      {/* Alert */}
      {alertMessage && (
        <div className="mb-6 p-4 bg-neo-yellow border-[3px] border-black rounded-2xl shadow-neo flex items-center justify-between gap-3 text-black">
          <div className="flex items-center gap-2 text-xs font-black">
            <AlertCircle className="w-5 h-5 text-black stroke-[3] flex-shrink-0" />
            <span>{alertMessage}</span>
          </div>
          <button onClick={() => setAlertMessage(null)} className="p-1 bg-white border border-black rounded-lg hover:bg-slate-200">
            <X className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Main Neo Card Rounded */}
      <div className="bg-white border-[3px] border-black rounded-3xl shadow-neo-lg p-6 sm:p-10 relative overflow-hidden">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`inline-block ${accentColor} text-black border-2 border-black rounded-full font-black uppercase text-xs px-3.5 py-1 shadow-neo-sm mb-3`}>
            {mode === 'merge' ? '📑 PDF MERGER TOOL' : '🗜️ PDF COMPRESSOR TOOL'}
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-black uppercase">
            {mode === 'merge' ? 'Gabungkan File PDF' : 'Kompres File PDF'}
          </h2>
          <p className="mt-2 text-sm font-bold text-slate-700 max-w-xl mx-auto">
            {mode === 'merge'
              ? 'Satukan 2 atau lebih file PDF secara berurutan menjadi satu file dokumen baru.'
              : 'Perkecil ukuran dokumen PDF tanpa mengurangi kualitas teks.'}
          </p>
        </div>

        {/* Drop Zone Rounded */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
          onDrop={e => { e.preventDefault(); setIsDragging(false); e.dataTransfer.files && handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-[3px] border-black border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
            isDragging
              ? 'bg-neo-blue/30 scale-[1.01]'
              : 'bg-[#FFFDF8] hover:bg-slate-50'
          }`}
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-neo-yellow border-2 border-black rounded-2xl flex items-center justify-center shadow-neo-sm">
            <UploadCloud className="w-8 h-8 text-black stroke-[2.5]" />
          </div>
          <p className="text-base font-black text-black">
            Tarik & Lepas file PDF ke sini, atau <span className="bg-neo-yellow px-2.5 py-1 border border-black rounded-lg underline">Pilih Dokumen PDF</span>
          </p>
          <p className="mt-2 text-xs font-bold text-slate-600">
            {mode === 'merge' ? 'Unggah minimal 2 file PDF (Maks. 25MB per file)' : 'Unggah 1 file PDF yang ingin dikompres'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple={mode === 'merge'}
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
            accept=".pdf"
          />
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3 text-xs font-black uppercase text-black">
              <span>{mode === 'merge' ? `Daftar PDF (${files.length})` : 'File Terpilih'}</span>
              <button
                onClick={clearAll}
                disabled={isProcessing}
                className="text-rose-600 hover:underline flex items-center gap-1 cursor-pointer font-black"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Reset</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {files.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="bg-white border-2 border-black rounded-2xl p-4 flex items-center justify-between gap-4 shadow-neo-sm"
                >
                  <div className="flex items-center gap-3.5 overflow-hidden flex-1">
                    <div className="w-10 h-10 bg-neo-blue border-2 border-black rounded-xl flex items-center justify-center flex-shrink-0 shadow-neo-sm">
                      <FileText className="w-5 h-5 text-black stroke-[2.5]" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-black text-black truncate" title={file.name}>
                        {mode === 'merge' && <span className="bg-neo-yellow border border-black rounded-md px-2 py-0.5 mr-2 font-mono text-xs">#{idx + 1}</span>}
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

            {/* CTA Action */}
            <div className="mt-6 pt-5 border-t-[3px] border-black flex items-center justify-end gap-3">
              <button
                onClick={processUtility}
                disabled={isProcessing || (mode === 'merge' && files.length < 2)}
                className="px-6 py-2.5 bg-neo-yellow border-2 border-black rounded-xl font-black text-xs shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin text-black stroke-[3]" /> : mode === 'merge' ? <Layers className="w-4 h-4 stroke-[3]" /> : <Minimize2 className="w-4 h-4 stroke-[3]" />}
                <span>{mode === 'merge' ? `GABUNGKAN ${files.length} DOKUMEN PDF` : 'MULAI KOMPRES PDF'}</span>
              </button>
            </div>

            {/* Success Download Card */}
            {downloadUrl && (
              <div className="mt-6 p-5 bg-neo-green border-[3px] border-black rounded-2xl shadow-neo flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-black">
                  <CheckCircle2 className="w-6 h-6 stroke-[3] flex-shrink-0" />
                  <div>
                    <p className="text-sm font-black uppercase">
                      {mode === 'merge' ? 'Penggabungan PDF Selesai!' : 'Kompresi PDF Selesai!'}
                    </p>
                    <p className="text-xs font-bold mt-0.5">Dokumen siap untuk diunduh langsung.</p>
                  </div>
                </div>
                <a
                  href={downloadUrl}
                  download={mode === 'merge' ? 'RPDF_Merged_Document.pdf' : 'RPDF_Compressed.pdf'}
                  className="w-full sm:w-auto px-5 py-2.5 bg-white border-2 border-black rounded-xl text-black font-black text-xs flex items-center justify-center gap-2 shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                >
                  <Download className="w-4 h-4 stroke-[3]" />
                  <span>UNDUH DOKUMEN (.PDF)</span>
                </a>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
