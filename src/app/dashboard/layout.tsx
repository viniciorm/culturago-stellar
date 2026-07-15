'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '../../components/DashboardLayout';

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const logged = sessionStorage.getItem('culturago_admin_logged');
      if (logged === 'true') {
        setAuthorized(true);
      } else {
        router.push('/login');
      }
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 text-stone-500">
        <div className="flex flex-col items-center gap-2">
          <svg className="animate-spin h-8 w-8 text-[#5C061E]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider">Verificando sesión...</span>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null; // Will redirect shortly
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
