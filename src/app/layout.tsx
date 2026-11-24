import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CulturaGO - Pasaportes Culturales Digitales Verificables",
  description: "Plataforma oficial de pasaportes y acreditaciones culturales digitales verificables para artistas, escuelas, eventos y proveedores. Piloto oficial FDVC Chile 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NEXT_PUBLIC_ENVIRONMENT === 'development';

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {isDev && (
          <aside
            aria-label="Ambiente de desarrollo"
            className="w-full bg-amber-500 text-slate-950 text-xs font-semibold px-2 py-0.5 text-center tracking-wider select-none z-50 sticky top-0"
          >
            [DEV]
          </aside>
        )}
        {children}
      </body>
    </html>
  );
}
