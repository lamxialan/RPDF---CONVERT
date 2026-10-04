import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { DocumentConverter } from './components/DocumentConverter';
import { ImageConverter } from './components/ImageConverter';
import { RemoveBgConverter } from './components/RemoveBgConverter';
import { PdfUtility } from './components/PdfUtility';
import { ActiveTab } from './types';
import { ShieldCheck, Zap, Layers, Minimize2, FileText, Image as ImageIcon, Wand2 } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('document');

  const getModuleInfo = (tab: ActiveTab) => {
    switch (tab) {
      case 'document':
        return {
          title: 'KONVERTER DOKUMEN',
          desc: 'Konversi multi-format PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), dan TXT.',
          color: 'bg-neo-green',
          icon: <FileText className="w-4 h-4 stroke-[2.5]" />
        };
      case 'image':
        return {
          title: 'KONVERTER GAMBAR',
          desc: 'Ubah gambar PNG, JPG, WEBP, HEIC, SVG ke resolusi optimal atau dokumen PDF.',
          color: 'bg-neo-purple',
          icon: <ImageIcon className="w-4 h-4 stroke-[2.5]" />
        };
      case 'remove-bg':
        return {
          title: 'HAPUS LATAR BELAKANG',
          desc: 'Pisahkan objek foto atau hilangkan background putih pada logo & siluet secara transparan.',
          color: 'bg-neo-pink',
          icon: <Wand2 className="w-4 h-4 stroke-[2.5]" />
        };
      case 'merge':
        return {
          title: 'GABUNGKAN PDF (MERGE)',
          desc: 'Satukan beberapa file dokumen PDF menjadi satu arsip utuh berurutan.',
          color: 'bg-neo-blue',
          icon: <Layers className="w-4 h-4 stroke-[2.5]" />
        };
      case 'compress':
        return {
          title: 'KOMPRESI PDF',
          desc: 'Kecilkan ukuran file PDF tanpa mengurangi ketajaman teks dan gambar.',
          color: 'bg-neo-yellow',
          icon: <Minimize2 className="w-4 h-4 stroke-[2.5]" />
        };
    }
  };

  const currentModule = getModuleInfo(activeTab);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F3] text-black relative overflow-x-hidden selection:bg-neo-yellow selection:text-black">

      {/* Neo-Brutalist Retro Decorative Elements in Background */}

      {/* Retro 4-Point Star Sparkle - Top Left */}
      <div className="fixed top-24 left-6 hidden lg:block pointer-events-none -z-10 animate-pulse duration-1000">
        <svg width="42" height="42" viewBox="0 0 24 24" className="drop-shadow-[3px_3px_0px_#000]">
          <path
            d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z"
            fill="#FFE600"
            stroke="#000"
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Retro 4-Point Star Sparkle - Right Middle */}
      <div className="fixed top-1/3 right-8 hidden lg:block pointer-events-none -z-10 rotate-12">
        <svg width="36" height="36" viewBox="0 0 24 24" className="drop-shadow-[3px_3px_0px_#000]">
          <path
            d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z"
            fill="#FF80BF"
            stroke="#000"
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Retro 4-Point Star Sparkle - Bottom Left */}
      <div className="fixed bottom-28 left-12 hidden lg:block pointer-events-none -z-10 -rotate-12">
        <svg width="32" height="32" viewBox="0 0 24 24" className="drop-shadow-[2px_2px_0px_#000]">
          <path
            d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z"
            fill="#00E5FF"
            stroke="#000"
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Floating Retro Geometric Shapes */}
      <div className="fixed top-14 left-[-35px] w-48 h-48 rounded-full bg-neo-yellow/20 border-2 border-black/15 pointer-events-none -z-10" />
      <div className="fixed bottom-16 right-[-30px] w-60 h-60 rounded-full bg-neo-pink/20 border-2 border-black/15 pointer-events-none -z-10" />
      <div className="fixed top-1/2 left-[5%] w-20 h-20 rounded-2xl rotate-12 bg-neo-purple/15 border-2 border-black/15 pointer-events-none -z-10" />
      <div className="fixed top-2/3 right-[7%] w-24 h-24 rounded-2xl -rotate-12 bg-neo-green/20 border-2 border-black/15 pointer-events-none -z-10" />

      {/* Top Sticky Navbar (Primary Navigation Hub) */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">

        {/* Hero Section (Clean, Bold, Tanpa Duplikasi Tab) */}
        <div className="mb-8 w-full max-w-3xl flex flex-col items-center text-center">

          {/* Active Module Indicator Badge */}
          <div className="inline-flex items-center gap-2 bg-white border-2 border-black rounded-full px-4 py-1.5 shadow-neo font-black text-xs uppercase mb-4 tracking-wider">
            <span className={`w-3 h-3 rounded-full border border-black ${currentModule.color} flex-shrink-0 animate-ping`} />
            <div className="flex items-center gap-1.5">
              {currentModule.icon}
              <span className="text-black">{currentModule.title}</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight uppercase text-black mb-3">
            RPDF CONVERTER<span className="text-neo-pink">.</span>
          </h1>
          <p className="text-sm sm:text-base font-bold text-slate-700 max-w-xl mx-auto">
            {currentModule.desc}
          </p>
        </div>

        {/* Dynamic Category View */}
        {activeTab === 'document' && (
          <DocumentConverter onSwitchToImageTab={() => setActiveTab('image')} />
        )}

        {activeTab === 'image' && (
          <ImageConverter onSwitchToDocumentTab={() => setActiveTab('document')} />
        )}

        {activeTab === 'remove-bg' && (
          <RemoveBgConverter />
        )}

        {activeTab === 'merge' && (
          <PdfUtility mode="merge" />
        )}

        {activeTab === 'compress' && (
          <PdfUtility mode="compress" />
        )}

        {/* 3 Bottom Feature Cards: Folder Tab Design with Rounded Corners */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full">

          {/* Folder Card 1: Google Docs Ready */}
          <div className="relative pt-6">
            <div className="absolute top-0 left-4 bg-neo-green text-black border-t-[3px] border-l-[3px] border-r-[3px] border-black rounded-t-xl px-4 py-1 text-xs font-black uppercase shadow-neo-sm">
              TAB #01
            </div>
            <div className="bg-white border-[3px] border-black rounded-3xl p-6 shadow-neo-lg flex flex-col items-start h-full overflow-hidden">
              <div className="w-12 h-12 bg-neo-green border-2 border-black rounded-2xl flex items-center justify-center shadow-neo-sm mb-4">
                <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="font-black text-lg text-black uppercase mb-1">
                Google Docs Ready
              </h3>
              <p className="text-xs font-bold text-slate-700 leading-relaxed">
                Anti broken-image pada hasil konversi PDF ke Word (DOCX). Semua objek grafis diekstrak sebagai PNG/JPEG sRGB utuh.
              </p>
            </div>
          </div>

          {/* Folder Card 2: AI Background Eraser */}
          <div className="relative pt-6">
            <div className="absolute top-0 left-4 bg-neo-pink text-black border-t-[3px] border-l-[3px] border-r-[3px] border-black rounded-t-xl px-4 py-1 text-xs font-black uppercase shadow-neo-sm">
              TAB #02
            </div>
            <div className="bg-white border-[3px] border-black rounded-3xl p-6 shadow-neo-lg flex flex-col items-start h-full overflow-hidden">
              <div className="w-12 h-12 bg-neo-pink border-2 border-black rounded-2xl flex items-center justify-center shadow-neo-sm mb-4">
                <Wand2 className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="font-black text-lg text-black uppercase mb-1">
                Chroma & AI Eraser
              </h3>
              <p className="text-xs font-bold text-slate-700 leading-relaxed">
                Hapus background putih pada logo, vektor, dan siluet secara presisi, serta pisahkan foto objek dengan AI Cutout.
              </p>
            </div>
          </div>

          {/* Folder Card 3: Batch Engine */}
          <div className="relative pt-6">
            <div className="absolute top-0 left-4 bg-neo-yellow text-black border-t-[3px] border-l-[3px] border-r-[3px] border-black rounded-t-xl px-4 py-1 text-xs font-black uppercase shadow-neo-sm">
              TAB #03
            </div>
            <div className="bg-white border-[3px] border-black rounded-3xl p-6 shadow-neo-lg flex flex-col items-start h-full overflow-hidden">
              <div className="w-12 h-12 bg-neo-yellow border-2 border-black rounded-2xl flex items-center justify-center shadow-neo-sm mb-4">
                <Zap className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="font-black text-lg text-black uppercase mb-1">
                Batch & Paste Instant
              </h3>
              <p className="text-xs font-bold text-slate-700 leading-relaxed">
                Dukungan upload multi-file antrean sekaligus, paste gambar langsung via Ctrl + V, dan unduh paket arsip ZIP satu klik.
              </p>
            </div>
          </div>

        </div>

      </main>

      {/* Footer Neo-Brutalist */}
      <footer className="mt-auto border-t-[3px] border-black bg-white py-6 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-black text-black">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black inline-block animate-ping" />
            <span>RPDF ENGINE PRO • PRIVACY-FIRST CONVERTER</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="bg-neo-yellow border border-black px-2.5 py-1 rounded-lg">
              CLEANUP 1-JAM OTOMATIS
            </span>
            <span>v2.5 RPDF PRO</span>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default App;
