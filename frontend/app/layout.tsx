import './globals.css';
import type { Metadata } from 'next';
import { Noto_Serif, Inter } from 'next/font/google';

const notoSerif = Noto_Serif({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '700'],
  variable: '--font-reader',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kho Truyện · EPUB Trans',
  description: 'Đọc & dịch truyện Trung → Việt',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`dark ${notoSerif.variable} ${inter.variable}`}>
      <body className="bg-slate-900 text-slate-100 min-h-screen font-sans">{children}</body>
    </html>
  );
}
