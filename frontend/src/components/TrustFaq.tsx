import React, { useState } from 'react';
import { ShieldCheck, ChevronDown, Lock, Zap, FileCheck, HelpCircle } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
  icon: React.ReactNode;
}

export const TrustFaq: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // Default open first question

  const faqs: FaqItem[] = [
    {
      question: 'Apakah berkas saya aman di RPDF?',
      answer: 'Tentu saja! Keamanan dan privasi Anda adalah prioritas mutlak. Seluruh berkas yang diunggah diproses dalam lingkungan memori terisolasi dan langsung dihapus secara permanen oleh daemon auto-cleanup server otomatis dalam hitungan menit. Kami tidak pernah membaca, menyimpan, atau mendistribusikan dokumen Anda ke pihak ketiga.',
      icon: <Lock className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
    },
    {
      question: 'Apakah ada batasan ukuran berkas?',
      answer: 'Setiap berkas memiliki batas maksimal 25 MB per dokumen. Pembatasan ini kami terapkan agar server dapat merender, mengompres, dan mengonversi berkas secara instan tanpa antrean panjang, serta menjaga keandalan proses.',
      icon: <Zap className="w-4 h-4 text-amber-600 stroke-[2.5]" />
    },
    {
      question: 'Apakah layanan RPDF ini 100% gratis?',
      answer: 'Ya! RPDF sepenuhnya gratis tanpa biaya tersembunyi, tanpa batas kuota konversi harian, dan tanpa perlu mendaftar akun ataupun memasukkan kartu kredit.',
      icon: <FileCheck className="w-4 h-4 text-blue-600 stroke-[2.5]" />
    },
    {
      question: 'Apakah hasil dokumen berantakan saat dibuka di Google Docs?',
      answer: 'Tidak. Engine konversi RPDF dilengkapi fitur khusus kompatibilitas Microsoft Office & Google Docs dengan konversi palet warna sRGB dan formatting paragraf bersih sehingga dokumen tidak rusak atau broken-image.',
      icon: <ShieldCheck className="w-4 h-4 text-purple-600 stroke-[2.5]" />
    }
  ];

  const toggleAccordion = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="w-full max-w-4xl mx-auto mt-16 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-neo-yellow text-black border-2 border-black rounded-full px-4 py-1 text-xs font-black uppercase shadow-neo-sm mb-2">
          <HelpCircle className="w-4 h-4 stroke-[3]" />
          <span>PUSAT PRIVASI & BANTUAN</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-black dark:text-white uppercase tracking-tight">
          JAMINAN KEAMANAN & FREQUENTLY ASKED QUESTIONS
        </h2>
        <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 mt-1 max-w-xl mx-auto">
          Transparan, aman tanpa jejak data, dan dirancang khusus untuk kenyamanan produktivitas Anda.
        </p>
      </div>

      {/* Accordion List */}
      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-[#1E1E1E] border-2 border-black dark:border-white rounded-2xl shadow-neo dark:shadow-neo-dark overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() => toggleAccordion(idx)}
                className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252525] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#2c2c2c] border border-black dark:border-white flex items-center justify-center flex-shrink-0 shadow-neo-sm">
                    {faq.icon}
                  </div>
                  <span className="text-sm sm:text-base font-black text-black dark:text-white">
                    {faq.question}
                  </span>
                </div>
                <div
                  className={`w-7 h-7 rounded-lg border border-black dark:border-white flex items-center justify-center bg-neo-yellow transition-transform duration-200 flex-shrink-0 ${
                    isOpen ? 'rotate-180 bg-neo-pink' : ''
                  }`}
                >
                  <ChevronDown className="w-4 h-4 text-black stroke-[3]" />
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 border-t-2 border-dashed border-slate-200 dark:border-neutral-700 leading-relaxed animate-fadeIn">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
