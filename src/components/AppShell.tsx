'use client';

import React from 'react';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div className="flex-1 flex flex-col bg-[#FCFBF7] text-[#1C1A17] min-h-screen">
      {children}
    </div>
  );
};
