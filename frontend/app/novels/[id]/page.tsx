import { notFound } from 'next/navigation';
import { supabaseAnon } from '@/lib/supabase-server';
import type { Novel, ChapterMeta } from '@/lib/types';
import Reader from './Reader';

export const revalidate = 0;

async function getNovelAndChapters(id: string): Promise<{ novel: Novel; chapters: ChapterMeta[] } | null> {
  const supa = supabaseAnon();
  const [novelRes, chaptersRes] = await Promise.all([
    supa.from('novels').select('*').eq('id', id).maybeSingle(),
    supa
      .from('chapters')
      .select('id, chapter_index, title, translated_content, word_count')
      .eq('novel_id', id)
      .order('chapter_index', { ascending: true }),
  ]);

  if (novelRes.error || !novelRes.data) return null;
  return {
    novel: novelRes.data as Novel,
    chapters: (chaptersRes.data as ChapterMeta[]) || [],
  };
}

export default async function NovelPage({ params }: { params: { id: string } }) {
  const result = await getNovelAndChapters(params.id);
  if (!result) notFound();
  return <Reader novel={result.novel} chapters={result.chapters} />;
}
