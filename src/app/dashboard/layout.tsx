import React from 'react';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '../../components/DashboardLayout';
import { getActorFromSession } from '../../infrastructure/auth/getActorFromSession';

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActorFromSession();
  if (!actor) {
    redirect('/login');
  }

  return (
    <DashboardLayout actor={actor}>
      {children}
    </DashboardLayout>
  );
}
