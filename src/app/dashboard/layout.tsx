import React from 'react';
import { DashboardLayout } from '../../components/DashboardLayout';

// Sin autenticación hasta Fase 8: el dashboard corre en modo demo local.
// La autorización real se resolverá con ActorContext + sesiones passkey.
export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
