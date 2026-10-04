import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import {
  UploadCloud,
  Download,
  Trash2,
  Play,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  Presentation,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Archive,
  X,
  ClipboardCopy
} from 'lucide-react';
import { FileItem, DOCUMENT_EXTENSIONS, DOCUMENT_TARGETS, IMAGE_EXTENSIONS } from '../types';
import { getApiUrl } from '../config/api';

interface DocumentConverterProps {
  onSwitchToImageTab?: () => void;
}

export const DocumentConverter: React.FC<DocumentConverterProps> = ({ onSwitchToImageTab }) => {
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessingAll, setIsProcessingAll] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<{ title: string; desc: string; type: 'error' | 'warning' | 'info' } | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSourceExt = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  };

  const handleFiles = (incomingFiles: FileList | File[]) => {
    const newItems: FileItem[] = [];
    const maxSizeBytes = 25 * 1024 * 1024;

    for (let i = 0; i < incomingFiles.length; i++) {
      const file = incomingFiles[i];

      if (file.size > maxSizeBytes) {
        setAlertMessage({
          title: 'File Terlalu Besar!',
          desc: `File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)}MB) melebihi batas 25MB.`,
          type: 'error'
        });
        continue;
      }

      const ext = getSourceExt(file.name);

      if (IMAGE_EXTENSIONS.includes(ext)) {
        setAlertMessage({
          title: 'Salah Kategori File!',
          desc: `File "${file.name}" adalah gambar. Silakan gunakan tab Konverter Gambar.`,
          type: 'warning'
        });
        continue;
      }

      if (!DOCUMENT_EXTENSIONS.includes(ext)) {
        setAlertMessage({
          title: 'Format Dokumen Tidak Didukung!',
          desc: `Format .${ext} belum didukung. Hanya menerima PDF, DOCX, XLSX, PPTX, dan TXT.`,
          type: 'warning'
        });
        continue;
      }

      const availableTargets = DOCUMENT_TARGETS[ext] || [];

      newItems.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        sourceExt: ext,
        targetFormat: availableTargets.length > 0 ? availableTargets[0] : 'pdf',
        availableTargets,
        status: 'idle',
        progress: 0
      });
    }

    if (newItems.length > 0) {
      setFileList(prev => [...prev, ...newItems]);
      setAlertMessage(null);
    }
  };

  // Event Listener Paste Langsung (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const pastedFiles: File[] = [];

      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        const file = item.getAsFile();
        if (file) {
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext && DOCUMENT_EXTENSIONS.includes(ext)) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        handleFiles(pastedFiles);
        setAlertMessage({
          title: 'Dokumen Berhasil Ditempel!',
          desc: `${pastedFiles.length} file dokumen dari clipboard telah ditambahkan ke antrean.`,
          type: 'info'
        });
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setFileList(prev => prev.filter(item => item.id !== id));
  };

  const clearAllFiles = () => {
    setFileList([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateTargetFormat = (id: string, target: string) => {
    setFileList(prev =>
      prev.map(item => (item.id === id ? { ...item, targetFormat: target } : item))
    );
  };

  const convertSingleFile = async (item: FileItem) => {
    setFileList(prev =>
      prev.map(f => (f.id === item.id ? { ...f, status: 'uploading', progress: 20, errorMessage: undefined } : f))
    );

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('target_format', item.targetFormat);

    try {
      const res = await fetch(getApiUrl('/api/convert'), { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Gagal mengunggah dokumen' }));
        throw new Error(err.detail || 'Gagal mengunggah');
      }

      const data = await res.json();
      const jobId = data.job_id;

      setFileList(prev =>
        prev.map(f => (f.id === item.id ? { ...f, status: 'processing', progress: 50, jobId } : f))
      );

      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const checkRes = await fetch(getApiUrl(`/api/jobs/${jobId}`));
            if (!checkRes.ok) throw new Error('Gagal memeriksa status');
            const jobData = await checkRes.json();

            if (jobData.status === 'completed') {
              clearInterval(interval);
              const downloadUrl = getApiUrl(jobData.download_url || `/api/download/${jobId}`);
              let convertedBlob: Blob | undefined;
              try {
                const blobRes = await fetch(downloadUrl);
                if (blobRes.ok) convertedBlob = await blobRes.blob();
              } catch (_) {}

              setFileList(prev =>
                prev.map(f =>
                  f.id === item.id
                    ? { ...f, status: 'completed', progress: 100, downloadUrl, convertedBlob }
                    : f
                )
              );
              resolve();
            } else if (jobData.status === 'failed') {
              clearInterval(interval);
              setFileList(prev =>
                prev.map(f =>
                  f.id === item.id ? { ...f, status: 'failed', progress: 0, errorMessage: jobData.error || 'Konversi gagal.' } : f
                )
              );
              reject(new Error(jobData.error || 'Gagal'));
            }
          } catch (e: any) {
            clearInterval(interval);
            setFileList(prev =>
              prev.map(f => f.id === item.id ? { ...f, status: 'failed', errorMessage: e.message } : f)
            );
            reject(e);
          }
        }, 1500);
      });
    } catch (err: any) {
      setFileList(prev =>
        prev.map(f => f.id === item.id ? { ...f, status: 'failed', errorMessage: err.message } : f)
      );
    }
  };

  const convertAllFiles = async () => {
    setIsProcessingAll(true);
    const idleFiles = fileList.filter(f => f.status === 'idle' || f.status === 'failed');
    await Promise.all(idleFiles.map(f => convertSingleFile(f)));
    setIsProcessingAll(false);
  };

  const downloadAllAsZip = async () => {
    const completedFiles = fileList.filter(f => f.status === 'completed');
    if (completedFiles.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of completedFiles) {
        let blob = item.convertedBlob;
        if (!blob && item.downloadUrl) {
          const res = await fetch(item.downloadUrl);
          if (res.ok) blob = await res.blob();
        }
        if (blob) {
          const stem = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
          zip.file(`${stem}_converted.${item.targetFormat}`, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `RPDF_Dokumen_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);
    } catch (err: any) {
      setAlertMessage({
        title: 'Pembuatan ZIP Gagal',
        desc: err.message || 'Gagal mengepak dokumen ZIP.',
        type: 'error'
      });
    } finally {
      setIsZipping(false);
    }
  };

  const getDocBadge = (ext: string) => {
    switch (ext.toLowerCase()) {
      case 'pdf':
        return {
          icon: <FileText className="w-5 h-5 text-rose-700 stroke-[2.5]" />,
          bg: 'bg-rose-100',
          label: 'PDF'
        };
      case 'docx':
      case 'doc':
        return {
          icon: <FileText className="w-5 h-5 text-blue-700 stroke-[2.5]" />,
          bg: 'bg-blue-100',
          label: 'DOCX'
        };
      case 'xlsx':
      case 'xls':
        return {
          icon: <FileSpreadsheet className="w-5 h-5 text-emerald-700 stroke-[2.5]" />,
          bg: 'bg-emerald-100',
          label: 'XLSX'
        };
      case 'pptx':
      case 'ppt':
        return {
          icon: <Presentation className="w-5 h-5 text-amber-700 stroke-[2.5]" />,
          bg: 'bg-amber-100',
          label: 'PPTX'
        };
      default:
        return {
          icon: <FileText className="w-5 h-5 text-slate-700 stroke-[2.5]" />,
          bg: 'bg-slate-100',
          label: ext.toUpperCase()
        };
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const completedCount = fileList.filter(f => f.status === 'completed').length;
  const isAnyProcessing = fileList.some(f => f.status === 'uploading' || f.status === 'processing') || isProcessingAll;

  return (
    <div className="w-full max-w-4xl mx-auto">
      
      {/* Alert Notification Neo-Brutalist Rounded */}
      {alertMessage && (
        <div className={`mb-6 p-4 border-[3px] border-black rounded-2xl shadow-neo flex items-start justify-between gap-3 text-black animate-in fade-in ${
          alertMessage.type === 'info' ? 'bg-neo-blue' : 'bg-neo-yellow'
        }`}>
          <div className="flex items-start gap-3">
            <div className="p-1 bg-black text-white rounded-lg">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <p className="font-black text-sm uppercase">{alertMessage.title}</p>
              <p className="mt-0.5 font-bold">{alertMessage.desc}</p>
              {alertMessage.title.includes('Salah Kategori') && onSwitchToImageTab && (
                <button
                  onClick={() => {
                    setAlertMessage(null);
                    onSwitchToImageTab();
                  }}
                  className="mt-2.5 inline-block bg-white text-black border-2 border-black rounded-xl px-3 py-1 font-black text-xs shadow-neo-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all cursor-pointer"
                >
                  Pindah ke Konverter Gambar ➔
                </button>
              )}
            </div>
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
          <div className="inline-block bg-neo-green text-black border-2 border-black rounded-full font-black uppercase text-xs px-3.5 py-1 shadow-neo-sm mb-3">
            📄 DOCUMENT ENGINE
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-black uppercase">
            Konverter Dokumen
          </h2>
          <p className="mt-2 text-sm font-bold text-slate-700 max-w-xl mx-auto">
            Ubah PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), dan TXT dengan presisi tinggi.
          </p>
        </div>

        {/* Drop Zone Neo-Brutalist Rounded with Paste Support */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-[3px] border-black border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
            isDragging
              ? 'bg-neo-green/30 scale-[1.01]'
              : 'bg-[#FFFDF8] hover:bg-slate-50'
          }`}
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-neo-yellow border-2 border-black rounded-2xl flex items-center justify-center shadow-neo-sm">
            <UploadCloud className="w-8 h-8 text-black stroke-[2.5]" />
          </div>
          <p className="text-base font-black text-black">
            Tarik & Lepas dokumen ke sini, atau <span className="bg-neo-yellow px-2.5 py-1 border border-black rounded-lg underline">Pilih Dokumen</span>
          </p>
          <p className="mt-2 text-xs font-bold text-slate-600">
            Mendukung: PDF, DOCX, XLSX, PPTX, TXT (Maks. 25MB per file)
          </p>

          {/* Paste Hint Badge */}
          <div className="mt-4 inline-flex items-center gap-1.5 bg-slate-100 border border-black rounded-lg px-3 py-1 text-xs font-black text-black shadow-neo-sm">
            <ClipboardCopy className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Bisa langsung tekan <kbd className="bg-white px-1.5 py-0.5 border border-black rounded text-[11px] font-mono">Ctrl + V</kbd> untuk Paste Dokumen</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
            accept=".pdf,.docx,.xlsx,.pptx,.txt"
          />
        </div>

        {/* Queue List */}
        {fileList.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3 text-xs font-black text-black uppercase">
              <span>Antrean Dokumen ({fileList.length})</span>
              <button
                onClick={clearAllFiles}
                disabled={isAnyProcessing}
                className="text-rose-600 hover:underline flex items-center gap-1 cursor-pointer font-black"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Kosongkan</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {fileList.map((item) => {
                const badgeInfo = getDocBadge(item.sourceExt);
                return (
                  <div
                    key={item.id}
                    className="bg-white border-2 border-black rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-neo-sm"
                  >
                    <div className="flex items-center gap-3.5 overflow-hidden flex-1">
                      {/* Document Type Badge Icon */}
                      <div className={`w-12 h-12 ${badgeInfo.bg} border-2 border-black rounded-xl flex items-center justify-center flex-shrink-0 shadow-neo-sm`}>
                        {badgeInfo.icon}
                      </div>

                      <div className="truncate">
                        <p className="text-sm font-black text-black truncate" title={item.name}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs font-bold text-slate-700">
                          <span>{formatFileSize(item.size)}</span>
                          <span>•</span>
                          <span className="bg-black text-white px-2 py-0.5 rounded-md uppercase text-[10px] font-black">
                            {item.sourceExt}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
                      {item.status !== 'completed' && item.status !== 'processing' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black">Ke:</span>
                          <select
                            value={item.targetFormat}
                            onChange={e => updateTargetFormat(item.id, e.target.value)}
                            disabled={item.status !== 'idle' && item.status !== 'failed'}
                            className="bg-white border-2 border-black rounded-xl text-xs font-black text-black px-2.5 py-1.5 shadow-neo-sm focus:outline-none"
                          >
                            {item.availableTargets.map(target => (
                              <option key={target} value={target}>
                                {target.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {(item.status === 'uploading' || item.status === 'processing') && (
                        <div className="flex items-center gap-2 min-w-[130px] font-bold text-xs">
                          <Loader2 className="w-4 h-4 animate-spin text-black stroke-[3]" />
                          <span>Memproses...</span>
                        </div>
                      )}

                      {item.status === 'completed' && (
                        <div className="flex items-center gap-1.5 bg-neo-green border border-black rounded-xl px-2.5 py-1 text-black text-xs font-black shadow-neo-sm">
                          <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                          <span>SELESAI</span>
                        </div>
                      )}

                      {item.status === 'failed' && (
                        <div className="flex items-center gap-1 bg-rose-200 border border-black rounded-xl px-2.5 py-1 text-rose-900 text-xs font-black" title={item.errorMessage}>
                          <AlertCircle className="w-4 h-4 stroke-[3]" />
                          <span>GAGAL</span>
                        </div>
                      )}

                      {item.status === 'completed' && item.downloadUrl && (
                        <a
                          href={item.downloadUrl}
                          download
                          className="px-3.5 py-1.5 bg-neo-yellow border-2 border-black rounded-xl text-black text-xs font-black flex items-center gap-1.5 shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                        >
                          <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>UNDUH</span>
                        </a>
                      )}

                      {item.status === 'idle' && (
                        <button
                          onClick={() => convertSingleFile(item)}
                          className="p-2 bg-neo-green border-2 border-black rounded-xl text-black font-black text-xs shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all cursor-pointer"
                          title="Konversi"
                        >
                          <Play className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      )}

                      <button
                        onClick={() => removeFile(item.id)}
                        disabled={item.status === 'processing' || item.status === 'uploading'}
                        className="p-2 border border-black rounded-xl hover:bg-rose-200 transition cursor-pointer"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4 text-black" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions Bar */}
            <div className="mt-6 pt-5 border-t-[3px] border-black flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs font-black text-black">
                <span>{completedCount} DARI {fileList.length} DOKUMEN SELESAI.</span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {completedCount > 0 && (
                  <button
                    onClick={downloadAllAsZip}
                    disabled={isZipping}
                    className="w-full sm:w-auto px-4 py-2.5 bg-white border-2 border-black rounded-xl font-black text-xs shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isZipping ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <Archive className="w-4 h-4 stroke-[2.5]" />}
                    <span>UNDUH SEMUA (.ZIP)</span>
                  </button>
                )}

                <button
                  onClick={convertAllFiles}
                  disabled={isAnyProcessing || fileList.every(f => f.status === 'completed')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-neo-yellow border-2 border-black rounded-xl font-black text-xs shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isAnyProcessing ? <Loader2 className="w-4 h-4 animate-spin text-black stroke-[3]" /> : <Play className="w-4 h-4 stroke-[3]" />}
                  <span>KONVERSI SEMUA DOKUMEN</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
