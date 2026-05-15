import Link from 'next/link';
import { supabaseAnon } from '@/lib/supabase-server';
import NovelCard from './components/NovelCard';
import SyncAllButton from './components/SyncAllButton';
import type { Novel } from '@/lib/types';

// Render ở request time để env vars Vercel có sẵn; tránh build fail khi
// NEXT_PUBLIC_SUPABASE_* chưa cấu hình.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

async function getNovels(): Promise<{ novels: Novel[]; error: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'missing NEXT_PUBLIC_SUPABASE_URL';
  try {
    const supa = supabaseAnon();
    const { data, error } = await supa
      .from('novels')
      .select('*')
      .order('last_updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false });
    if (error) {
      const e = error as { message: string; cause?: { code?: string; message?: string }; details?: string };
      console.error('Supabase returned error:', e);
      const cause = e.cause
        ? ` cause=${e.cause.code || e.cause.message || JSON.stringify(e.cause)}`
        : e.details
          ? ` details=${e.details}`
          : '';
      return { novels: [], error: `[supabase] ${e.message}${cause} url=${supabaseUrl}` };
    }
    return { novels: (data as Novel[]) || [], error: null };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    console.error('getNovels threw:', err, 'cause:', err.cause);
    const cause = err.cause
      ? ` cause=${err.cause.code || err.cause.message || JSON.stringify(err.cause)}`
      : '';
    return { novels: [], error: `[throw] ${err.message}${cause} url=${supabaseUrl}` };
  }
}

export default async function HomePage() {
  const { novels, error } = await getNovels();

  return (
    <main className="min-h-screen px-4 md:px-8 py-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h1 className="text-3xl font-bold">📚 Kho Truyện</h1>
        <div className="flex gap-2">
          <Link
            href="/search"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium"
          >
            🔍 Tìm truyện mới
          </Link>
          <SyncAllButton />
        </div>
      </header>

      {error ? (
        <div className="mx-auto max-w-2xl rounded-lg border border-rose-700 bg-rose-900/30 p-4 text-sm text-rose-100">
          Không đọc được danh sách truyện: {error}
        </div>
      ) : novels.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-lg mb-2">Chưa có truyện nào trong kho.</p>
          <Link href="/search" className="text-emerald-400 hover:underline">
            Thêm truyện đầu tiên →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {novels.map((n) => (
            <NovelCard key={n.id} novel={n} />
          ))}
        </div>
      )}
    </main>
  );
}
