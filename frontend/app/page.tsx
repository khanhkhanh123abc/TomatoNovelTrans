import Link from 'next/link';
import { supabaseAnon } from '@/lib/supabase-server';
import NovelCard from './components/NovelCard';
import SyncAllButton from './components/SyncAllButton';
import type { Novel } from '@/lib/types';

export const revalidate = 60;

async function getNovels(): Promise<Novel[]> {
  const supa = supabaseAnon();
  const { data, error } = await supa
    .from('novels')
    .select('*')
    .eq('status', 'active')
    .order('last_updated_at', { ascending: false });
  if (error) {
    console.error(error);
    return [];
  }
  return (data as Novel[]) || [];
}

export default async function HomePage() {
  const novels = await getNovels();

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

      {novels.length === 0 ? (
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
