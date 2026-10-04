import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, Zap } from 'lucide-react';

interface LoadingModalProps {
  isOpen: boolean;
  title?: string;
  stage?: 'uploading' | 'processing' | 'finishing' | 'completed';
  customMessage?: string;
  progress?: number;
}

export const LoadingModal: React.FC<LoadingModalProps> = ({
  isOpen,
  title = 'MEMPROSES BERKAS...',
  stage = 'processing',
  customMessage,
  progress: externalProgress
}) => {
  const [internalProgress, setInternalProgress] = useState<number>(15);

  useEffect(() => {
    if (!isOpen) {
      setInternalProgress(15);
      return;
    }

    if (externalProgress !== undefined) {
      setInternalProgress(externalProgress);
      return;
    }

    // Simulasi progress dinamis yang halus & responsif
    const interval = setInterval(() => {
      setInternalProgress(prev => {
        if (stage === 'uploading') {
          return prev < 40 ? prev + Math.floor(Math.random() * 8 + 4) : 40;
        } else if (stage === 'processing') {
          return prev < 88 ? prev + Math.floor(Math.random() * 6 + 2) : 88;
        } else if (stage === 'finishing' || stage === 'completed') {
          return 100;
        }
        return prev < 90 ? prev + 3 : 90;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isOpen, stage, externalProgress]);

  if (!isOpen) return null;

  const getStatusText = () => {
    if (customMessage) return customMessage;
    if (internalProgress >= 100 || stage === 'completed') return 'Selesai! Menyiapkan Berkas...';
    if (internalProgress > 75 || stage === 'finishing') return 'Hampir Selesai! Finalisasi Dokumen...';
    if (internalProgress > 35 || stage === 'processing') return 'Memproses & Mengoptimalkan Berkas...';
    return 'Mengunggah Berkas ke RPDF Engine...';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border-[3px] border-black rounded-3xl p-6 sm:p-8 shadow-neo-lg max-w-sm sm:max-w-md w-full relative overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-1.5 bg-neo-yellow border-2 border-black rounded-full px-3 py-0.5 text-[11px] font-black uppercase shadow-neo-sm">
            <Zap className="w-3.5 h-3.5 fill-black stroke-[2.5]" />
            <span>RPDF ENGINE v1.5</span>
          </div>
          <span className="text-xs font-mono font-black text-black bg-slate-100 border border-black rounded-md px-2 py-0.5">
            {Math.min(100, Math.max(0, internalProgress))}%
          </span>
        </div>

        {/* Center Animated Visual */}
        <div className="flex flex-col items-center justify-center my-4 text-center">
          <div className="w-16 h-16 bg-neo-yellow border-2 border-black rounded-2xl flex items-center justify-center shadow-neo mb-4 relative">
            {internalProgress >= 100 ? (
              <CheckCircle2 className="w-8 h-8 text-black stroke-[3] animate-bounce" />
            ) : (
              <>
                <Loader2 className="w-8 h-8 text-black stroke-[3] animate-spin" />
                <Sparkles className="w-4 h-4 text-amber-600 fill-amber-500 absolute -top-1 -right-1 animate-pulse" />
              </>
            )}
          </div>

          <h3 className="text-lg sm:text-xl font-black text-black uppercase tracking-tight mb-1">
            {title}
          </h3>

          <p className="text-xs sm:text-sm font-bold text-slate-700 min-h-[20px]">
            {getStatusText()}
          </p>
        </div>

        {/* Neo-Brutalist Progress Bar */}
        <div className="w-full bg-slate-100 border-2 border-black rounded-xl h-5 p-0.5 shadow-neo-sm mb-4 overflow-hidden relative">
          <div
            className="h-full bg-neo-green border border-black rounded-lg transition-all duration-300 relative"
            style={{ width: `${Math.min(100, Math.max(5, internalProgress))}%` }}
          >
            {/* Subtle Diagonal Striping */}
            <div className="absolute inset-0 bg-white/20 bg-[linear-gradient(45deg,rgba(0,0,0,0.1)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.1)_50%,rgba(0,0,0,0.1)_75%,transparent_75%,transparent)] bg-[length:12px_12px]" />
          </div>
        </div>

        {/* Security / Privacy Assurance Note */}
        <div className="bg-slate-50 border border-black rounded-xl p-2.5 text-center">
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-600">
            🔒 File Anda diproses secara privat & otomatis dihapus dalam 1 jam.
          </p>
        </div>

      </div>
    </div>
  );
};
