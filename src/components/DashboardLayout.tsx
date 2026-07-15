'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  Building2, 
  Truck, 
  Award, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Database,
  RefreshCw,
  Globe
} from 'lucide-react';
import { isSupabaseConfigured, mockDb } from '../lib/db';
import { Button } from './ui/Button';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = () => {
    // Standard mock logout
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('culturago_admin_logged');
    }
    router.push('/login');
  };

  const handleResetMockDb = () => {
    if (confirm('¿Estás seguro de que quieres restablecer la base de datos local a su estado semilla inicial?')) {
      mockDb.reset();
      window.location.reload();
    }
  };

  const menuItems = [
    { name: 'Inicio', href: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { name: 'Evento FDVC 2026', href: '/dashboard/eventos/fdvc-2026', icon: <Calendar className="w-4 h-4" /> },
    { name: 'Personas', href: '/dashboard/personas', icon: <Users className="w-4 h-4" /> },
    { name: 'Organizaciones', href: '/dashboard/organizaciones', icon: <Building2 className="w-4 h-4" /> },
    { name: 'Proveedores', href: '/dashboard/proveedores', icon: <Truck className="w-4 h-4" /> },
    { name: 'Credenciales', href: '/dashboard/credenciales', icon: <Award className="w-4 h-4" /> },
    { name: 'Configuración', href: '/dashboard/configuracion', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen flex bg-stone-100 text-[#1C1A17]">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex lg:flex-shrink-0 lg:w-64 lg:flex-col border-r border-stone-200 bg-[#FCFBF7]">
        <div className="flex items-center gap-3 px-6 h-16 border-b border-stone-200">
          <div className="w-8 h-8 rounded-lg bg-[#5C061E] flex items-center justify-center text-[#C5A880] font-bold">
            C
          </div>
          <span className="font-serif text-base tracking-wide font-bold text-[#5C061E]">
            Panel CulturaGO
          </span>
        </div>

        {/* Database indicator */}
        {isClient && (
          <div className="px-4 py-3 mx-4 mt-4 rounded-lg bg-stone-50 border border-stone-200 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-600">
              <Database className="w-3.5 h-3.5 text-[#C5A880]" />
              Motor: {isSupabaseConfigured ? 'Supabase Real' : 'Local Mock'}
            </div>
            {!isSupabaseConfigured && (
              <button 
                onClick={handleResetMockDb}
                className="text-[10px] text-[#5C061E] hover:underline flex items-center gap-1 font-medium text-left self-start mt-1"
              >
                <RefreshCw className="w-3 h-3" />
                Reiniciar datos semilla
              </button>
            )}
          </div>
        )}

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150
                  ${isActive 
                    ? 'bg-[#5C061E]/5 text-[#5C061E] border-l-4 border-[#5C061E]' 
                    : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }
                `}
              >
                {item.icon}
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-200 bg-stone-50/50">
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 font-medium mb-2"
          >
            <Globe className="w-4 h-4 text-stone-400" />
            Ver Portal Público
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-6 h-16 bg-[#FCFBF7] border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#5C061E] flex items-center justify-center text-[#C5A880] font-bold">
              C
            </div>
            <span className="font-serif text-sm tracking-wide font-bold text-[#5C061E]">
              CulturaGO Admin
            </span>
          </div>
          <button 
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </header>

        {/* Mobile Nav Overlay */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
            <aside className="relative flex flex-col w-64 max-w-xs bg-[#FCFBF7] h-full shadow-xl">
              <div className="flex items-center justify-between px-6 h-16 border-b border-stone-200">
                <span className="font-serif text-base tracking-wide font-bold text-[#5C061E]">
                  CulturaGO Admin
                </span>
                <button onClick={() => setMobileOpen(false)} className="text-stone-400 hover:text-stone-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`
                        flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                        ${isActive 
                          ? 'bg-[#5C061E]/5 text-[#5C061E] border-l-4 border-[#5C061E]' 
                          : 'text-stone-600 hover:bg-stone-50'
                        }
                      `}
                    >
                      {item.icon}
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-stone-200">
                <Link
                  href="/"
                  className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 font-medium mb-2"
                >
                  <Globe className="w-4 h-4 text-stone-400" />
                  Ver Portal Público
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 font-medium transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Dashboard Pages Body */}
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
