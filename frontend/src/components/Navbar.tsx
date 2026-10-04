import React from 'react';
import { FileText, Image as ImageIcon, Layers, Minimize2, Wand2, Zap } from 'lucide-react';
import { ActiveTab } from '../types';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
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
      id: 'merge',
      label: 'Merge PDF',
      icon: <Layers className="w-4 h-4 stroke-[2.5]" />,
      color: 'bg-neo-blue'
    },
    {
      id: 'compress',
      label: 'Compress',
      icon: <Minimize2 className="w-4 h-4 stroke-[2.5]" />,
      color: 'bg-neo-yellow'
    }
  ];

  return (
    <header className="border-b-[3px] border-black bg-white sticky top-0 z-50 transition-all">
      <div className="max-w-6xl mx-auto px-4">
        {/* Main Bar */}
        <div className="h-16 sm:h-20 flex items-center justify-between gap-4">

          {/* Brand Logo Retro Neo-Brutalist Rounded */}
          <div
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none flex-shrink-0"
            onClick={() => onTabChange('document')}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-neo-yellow border-2 border-black rounded-xl flex items-center justify-center shadow-neo group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-neo-sm transition-all p-1 overflow-hidden">
              <img src="/logo.png" alt="RPDF Logo" className="w-full h-full object-contain filter drop-shadow-[1px_1px_0px_#000]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-black text-xl sm:text-2xl tracking-tight text-black">
                RPDF<span className="text-neo-pink">.</span>
              </span>
            </div>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-2 p-1.5 bg-slate-50 border-2 border-black rounded-2xl shadow-neo-sm">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 border-2 border-black rounded-xl text-xs font-black transition-all cursor-pointer ${isActive
                    ? `${item.color} text-black shadow-neo translate-x-[-1px] translate-y-[-1px]`
                    : 'bg-white text-black hover:bg-slate-100 hover:shadow-neo-sm'
                    }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-neo-yellow border-2 border-black rounded-full px-3 py-1 text-xs font-black shadow-neo-sm text-black">
              <Zap className="w-3.5 h-3.5 stroke-[2.5] fill-black" />
              <span className="hidden sm:inline">100% FREE & PRIVATE</span>
              <span className="sm:hidden">FREE</span>
            </div>
          </div>

        </div>

        {/* Mobile Sub-Navigation Bar (Horizontal Scrolling) */}
        <div className="md:hidden pb-3 pt-1 overflow-x-auto no-scrollbar flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border-2 border-black rounded-xl text-xs font-black whitespace-nowrap transition-all flex-shrink-0 cursor-pointer ${isActive
                  ? `${item.color} text-black shadow-neo -translate-y-0.5`
                  : 'bg-white text-black hover:bg-slate-100 shadow-neo-sm'
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
