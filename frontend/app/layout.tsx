import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kho Truyện · EPUB Trans',
  description: 'Đọc & dịch truyện Trung → Việt',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-slate-900 text-slate-100 min-h-screen">{children}</body>
    </html>
  );
}
