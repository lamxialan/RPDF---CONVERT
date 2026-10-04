import React, { useState, useEffect } from 'react';
import { Clock, Download, Trash2, FileText } from 'lucide-react';
import { RecentActivityItem } from '../types';
import { getRecentActivities, clearRecentActivities } from '../utils/recentActivity';

export const RecentActivity: React.FC = () => {
  const [items, setItems] = useState<RecentActivityItem[]>([]);

  const loadItems = () => {
    setItems(getRecentActivities());
  };

  useEffect(() => {
    loadItems();
    const handleUpdate = () => loadItems();
    window.addEventListener('rpdf_recent_update', handleUpdate);
    return () => window.removeEventListener('rpdf_recent_update', handleUpdate);
  }, []);

  if (items.length === 0) {
    return null; // Tidak ditampilkan jika riwayat masih kosong
  }

  const formatTimeAgo = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Baru saja';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} menit yang lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam yang lalu`;
    return new Date(timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <section className="w-full max-w-4xl mx-auto mt-12 px-4">
      <div className="bg-white dark:bg-[#1E1E1E] border-[3px] border-black dark:border-white rounded-3xl p-5 sm:p-7 shadow-neo-lg dark:shadow-neo-dark">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2 pb-3 border-b-2 border-black dark:border-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-neo-yellow border-2 border-black flex items-center justify-center shadow-neo-sm">
              <Clock className="w-4 h-4 text-black stroke-[3]" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-black dark:text-white uppercase tracking-tight">
                AKTIVITAS TERAKHIR ({items.length})
              </h3>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Tersimpan di peramban lokal Anda
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={clearRecentActivities}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50 border-2 border-black dark:border-white rounded-xl text-xs font-black text-rose-700 dark:text-rose-400 shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
            title="Bersihkan riwayat unduhan lokal"
          >
            <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Hapus Riwayat</span>
          </button>
        </div>

        {/* List of Recent Items */}
        <div className="space-y-2.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-slate-50 dark:bg-[#252525] border-2 border-black dark:border-white rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-neo-sm hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <div className="flex items-center gap-3 overflow-hidden flex-1">
                <div className="w-10 h-10 bg-neo-blue border-2 border-black rounded-xl flex items-center justify-center flex-shrink-0 shadow-neo-sm">
                  <FileText className="w-5 h-5 text-black stroke-[2.5]" />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase bg-black text-white px-1.5 py-0.5 rounded shadow-neo-sm">
                      {item.operation}
                    </span>
                    <p className="text-xs sm:text-sm font-black text-black dark:text-white truncate" title={item.fileName}>
                      {item.fileName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>{formatTimeAgo(item.timestamp)}</span>
                    {item.fileSize ? (
                      <>
                        <span>•</span>
                        <span className="font-mono">{formatFileSize(item.fileSize)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <a
                href={item.downloadUrl}
                download={item.fileName}
                className="w-full sm:w-auto px-4 py-2 bg-neo-green hover:bg-emerald-400 border-2 border-black rounded-xl font-black text-xs text-black shadow-neo-sm flex items-center justify-center gap-1.5 hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer flex-shrink-0"
              >
                <Download className="w-3.5 h-3.5 stroke-[3]" />
                <span>Unduh Lagi</span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
