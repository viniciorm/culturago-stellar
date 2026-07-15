'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Award, LogIn } from 'lucide-react';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#FCFBF7] text-[#1C1A17]">
      {/* Top fine gold line accent */}
      <div className="h-1 bg-[#C5A880]" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#FCFBF7]/90 backdrop-blur-md border-b border-stone-200/60 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-[#5C061E] flex items-center justify-center text-[#C5A880] font-semibold text-base transition-transform group-hover:scale-105">
                C
              </div>
              <span className="font-serif text-lg tracking-wide font-bold bg-gradient-to-r from-[#5C061E] to-[#8A1434] bg-clip-text text-transparent">
                CulturaGO
              </span>
            </Link>
            <span className="hidden sm:inline-block text-xs bg-stone-100 text-stone-600 px-2.5 py-0.5 rounded-md font-medium border border-stone-200/50">
              FDVC 2026
            </span>
          </div>

          <nav className="flex items-center gap-6">
            <Link 
              href="/evento/fdvc-2026" 
              className="text-sm font-medium text-stone-600 hover:text-[#5C061E] transition-colors"
            >
              Festival 2026
            </Link>
            <Link 
              href="/login" 
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5C061E] hover:text-[#4A0518] transition-colors bg-[#5C061E]/5 hover:bg-[#5C061E]/10 px-3.5 py-1.5 rounded-lg border border-[#5C061E]/15"
            >
              <LogIn className="w-4 h-4" />
              Acceso Admin
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/60 bg-stone-50/50 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-stone-400">
            <ShieldCheck className="w-5 h-5 text-[#C5A880]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Verificado por CulturaGO
            </span>
          </div>
          <p className="text-xs text-stone-400 text-center sm:text-right">
            Pasaportes culturales verificables • Piloto FDVC 2026 • © {new Date().getFullYear()} CulturaGO.
          </p>
        </div>
      </footer>
    </div>
  );
};
