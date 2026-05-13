export type Novel = {
  id: string;
  book_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  total_chapters: number;
  status: 'active' | 'paused' | 'completed';
  last_updated_at: string;
  created_at: string;
};

export type Chapter = {
  id: string;
  novel_id: string;
  chapter_index: number;
  title: string;
  content: string;
  translated_content: string | null;
  translated_at: string | null;
  translation_api: string | null;
  word_count: number;
};

export type ChapterMeta = Pick<
  Chapter,
  'id' | 'chapter_index' | 'title' | 'translated_content' | 'word_count'
>;

export type TranslateProvider = 'mymemory' | 'gemini' | 'deepseek' | 'qwen';

export type SearchResult = {
  book_id: string;
  title: string;
  author?: string;
  cover_url?: string;
  description?: string;
  total_chapters?: number;
};
