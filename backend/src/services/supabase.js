const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const ws = require('ws');
const config = require('../config');

// Node 20 chưa có WebSocket native; @supabase/realtime-js từ v2.45 trở đi
// đòi WebSocket constructor ngay khi createClient() → cung cấp `ws` qua transport.
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function upsertNovel(novel) {
  const { data, error } = await supabase
    .from('novels')
    .upsert(
      {
        book_id: novel.book_id,
        title: novel.title,
        author: novel.author,
        cover_url: novel.cover_url,
        description: novel.description,
        epub_storage_path: novel.epub_storage_path,
        total_chapters: novel.total_chapters ?? 0,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'book_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getNovelByBookId(bookId) {
  const { data, error } = await supabase
    .from('novels')
    .select('*')
    .eq('book_id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getAllNovels() {
  const { data, error } = await supabase
    .from('novels')
    .select('*')
    .eq('status', 'active')
    .order('last_updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getChapterCount(novelId) {
  const { count, error } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .eq('novel_id', novelId);
  if (error) throw error;
  return count || 0;
}

async function upsertChapters(novelId, chapters) {
  if (!chapters?.length) return 0;
  const rows = chapters.map((ch) => ({
    novel_id: novelId,
    chapter_index: ch.index,
    title: ch.title,
    content: ch.content,
    word_count: ch.content.length,
  }));

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('chapters')
      .upsert(slice, { onConflict: 'novel_id,chapter_index' });
    if (error) throw error;
  }
  return rows.length;
}

async function uploadNovelEpub(novel, epubPath) {
  const storagePath = `${novel.book_id}/${path.basename(epubPath)}`;
  const file = fs.readFileSync(epubPath);
  const { error } = await supabase.storage
    .from('novels')
    .upload(storagePath, file, {
      contentType: 'application/epub+zip',
      upsert: true,
    });
  if (error) throw error;
  return storagePath;
}

async function saveTranslation(chapterId, translatedContent, apiUsed) {
  const { error } = await supabase
    .from('chapters')
    .update({
      translated_content: translatedContent,
      translated_at: new Date().toISOString(),
      translation_api: apiUsed,
    })
    .eq('id', chapterId);
  if (error) throw error;
}

async function logSync(novelId, action, newChapters, status, message) {
  await supabase.from('sync_logs').insert({
    novel_id: novelId,
    action,
    new_chapters: newChapters,
    status,
    message: message?.slice(0, 1000),
  });
}

module.exports = {
  client: supabase,
  upsertNovel,
  getNovelByBookId,
  getAllNovels,
  getChapterCount,
  upsertChapters,
  uploadNovelEpub,
  saveTranslation,
  logSync,
};
