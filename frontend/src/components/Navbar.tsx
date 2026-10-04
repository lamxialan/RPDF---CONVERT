import React, { useState, useEffect } from 'react';
import { FileText, Image as ImageIcon, Layers, Wand2, Zap, Sun, Moon } from 'lucide-react';
import { ActiveTab } from '../types';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rpdf_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('rpdf_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('rpdf_theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  const isItemActive = (itemId: ActiveTab) => {
    if (itemId === 'pdf-tools') {
      return activeTab === 'pdf-tools' || activeTab === 'merge' || activeTab === 'compress';
    }
    return activeTab === itemId;
  };

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; color: string }[] = [
    {
      id: 'document',
      label: 'Dokumen',
      icon: <FileText className="w-4 h-4 stroke-[2.5]" />,
      color: 'bg-neo-green'
    },
    {
      id: 'image',
      label: 'Gambar',
      icon: <ImageIcon className="w-4 h-4 stroke-[2.5]" />,
      color: 'bg-neo-purple'
    },
    {
      id: 'remove-bg',
      label: 'Remove BG',
      icon: <Wand2 className="w-4 h-4 stroke-[2.5]" />,
      color: 'bg-neo-pink'
    },
    {
      id: 'pdf-tools',
      label: 'Alat PDF (11-in-1)',
      icon: <Layers className="w-4 h-4 stroke-[2.5]" />,
      color: 'bg-neo-yellow'
    }
  ];

  return (
    <header className="border-b-[3px] border-black dark:border-white bg-white dark:bg-[#181818] sticky top-0 z-50 transition-all">
      <div className="max-w-6xl mx-auto px-4">
        {/* Main Bar */}
        <div className="h-16 sm:h-20 flex items-center justify-between gap-3 sm:gap-4">

          {/* Brand Logo Retro Neo-Brutalist Rounded */}
          <div
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none flex-shrink-0"
            onClick={() => onTabChange('document')}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-neo-yellow border-2 border-black dark:border-white rounded-xl flex items-center justify-center shadow-neo dark:shadow-neo-dark group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-neo-sm transition-all p-1 overflow-hidden">
              <img src="/logo.png" alt="RPDF Logo" className="w-full h-full object-contain filter drop-shadow-[1px_1px_0px_#000]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-black text-xl sm:text-2xl tracking-tight text-black dark:text-white">
                RPDF<span className="text-neo-pink">.</span>
              </span>
            </div>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-[#252525] border-2 border-black dark:border-white rounded-2xl shadow-neo-sm">
            {navItems.map((item) => {
              const isActive = isItemActive(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 border-2 border-black dark:border-white rounded-xl text-xs font-black transition-all cursor-pointer ${isActive
                    ? `${item.color} text-black shadow-neo translate-x-[-1px] translate-y-[-1px]`
                    : 'bg-white dark:bg-[#1E1E1E] text-black dark:text-white hover:bg-slate-100 dark:hover:bg-[#2c2c2c] hover:shadow-neo-sm'
                    }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Section: Version, Badge & Dark Mode Toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline bg-white dark:bg-[#1E1E1E] border-2 border-black dark:border-white rounded-full px-2.5 py-0.5 text-[11px] font-black shadow-neo-sm text-black dark:text-white">
              v1.5
            </span>
            <div className="flex items-center gap-1.5 bg-neo-yellow border-2 border-black rounded-full px-3 py-1 text-xs font-black shadow-neo-sm text-black">
              <Zap className="w-3.5 h-3.5 stroke-[2.5] fill-black" />
              <span className="hidden sm:inline">100% FREE & PRIVATE</span>
              <span className="sm:hidden">FREE</span>
            </div>

            {/* Neo-Brutalist Theme Switcher Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 sm:px-2.5 sm:py-2 bg-white dark:bg-[#252525] border-2 border-black dark:border-white rounded-xl shadow-neo dark:shadow-neo-dark hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer text-black dark:text-white flex items-center gap-1.5"
              title={isDark ? "Aktifkan Tema Terang" : "Aktifkan Tema Gelap"}
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 stroke-[2.5]" />
                  <span className="hidden lg:inline text-xs font-black">TERANG</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-700 stroke-[2.5]" />
                  <span className="hidden lg:inline text-xs font-black">GELAP</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* Mobile Sub-Navigation Bar (Horizontal Scrolling) */}
        <div className="md:hidden pb-3 pt-1 overflow-x-auto no-scrollbar flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = isItemActive(item.id);
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border-2 border-black dark:border-white rounded-xl text-xs font-black whitespace-nowrap transition-all flex-shrink-0 cursor-pointer ${isActive
                  ? `${item.color} text-black shadow-neo -translate-y-0.5`
                  : 'bg-white dark:bg-[#1E1E1E] text-black dark:text-white hover:bg-slate-100 dark:hover:bg-[#2c2c2c] shadow-neo-sm'
                  }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};
