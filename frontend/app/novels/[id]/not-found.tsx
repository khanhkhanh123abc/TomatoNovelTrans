import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-300">
      <h1 className="text-2xl font-bold">Không tìm thấy truyện</h1>
      <Link href="/" className="text-emerald-400 hover:underline">
        ← Về kho truyện
      </Link>
    </div>
  );
}
