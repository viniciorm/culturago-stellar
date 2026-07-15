'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Award, Lock, Mail, ArrowLeft, LogIn } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@culturago.cl');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if already logged in
    if (typeof window !== 'undefined') {
      const logged = sessionStorage.getItem('culturago_admin_logged');
      if (logged === 'true') {
        router.push('/dashboard');
      }
    }
  }, [router]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulated short delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Simple validation for MVP
    if (email === 'admin@culturago.cl' && password === 'admin123') {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('culturago_admin_logged', 'true');
      }
      router.push('/dashboard');
    } else {
      setError('Credenciales de administrador incorrectas. Para este demo use admin@culturago.cl y admin123');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#FCFBF7] text-[#1C1A17]">
      {/* Gold Top Border */}
      <div className="h-1 bg-[#C5A880]" />

      {/* Back to portal */}
      <div className="pt-6 px-8 max-w-7xl w-full mx-auto flex">
        <Link 
          href="/" 
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-[#5C061E] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al Portal Público
        </Link>
      </div>

      {/* Main card */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-xl p-8 relative overflow-hidden text-left">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-32 h-32 rounded-full border border-[#C5A880]/15 pointer-events-none" />
          
          <div className="flex flex-col items-center text-center space-y-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#5C061E] flex items-center justify-center text-[#C5A880] font-bold text-lg">
              C
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#1C1A17]">Panel de Administración</h2>
              <p className="text-xs text-stone-400 mt-1">
                Acceso restringido para organizadores del festival FDVC 2026.
              </p>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <Input
              label="Correo de Administrador"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@culturago.cl"
            />

            <Input
              label="Contraseña"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            {error && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full py-2.5 mt-2" isLoading={isLoading}>
              <LogIn className="w-4 h-4 mr-2" />
              Ingresar al Dashboard
            </Button>
          </form>

          {/* Dev credentials hint */}
          <div className="mt-6 p-3 bg-stone-50 border border-stone-200/50 rounded-lg text-[10px] text-stone-500 leading-relaxed">
            <span className="font-bold text-[#5C061E] block mb-1">Acceso Demo MVP:</span>
            <span>Correo: <span className="font-mono font-bold select-all">admin@culturago.cl</span></span><br />
            <span>Clave: <span className="font-mono font-bold select-all">admin123</span></span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-stone-200/60 bg-stone-50/50 py-6 text-center text-[10px] text-stone-400">
        CulturaGO • Panel de Acreditación Institucional • Todos los derechos reservados.
      </footer>
    </div>
  );
}
