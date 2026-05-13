-- ============================================================
-- EpubTrans · Supabase schema
-- Chạy trong Supabase SQL Editor một lần duy nhất.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- novels: metadata truyện
-- ============================================================
create table if not exists novels (
  id uuid primary key default gen_random_uuid(),
  book_id text unique not null,                       -- ID trên Tomato/Fanqie
  title text not null,
  author text,
  cover_url text,
  epub_storage_path text,
  description text,
  total_chapters integer not null default 0,
  status text not null default 'active'               -- active | paused | completed
    check (status in ('active', 'paused', 'completed')),
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
-- chapters: nội dung từng chương (plain text)
-- ============================================================
create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels(id) on delete cascade,
  chapter_index integer not null,
  title text not null,
  content text not null,                              -- plain text tiếng Trung
  translated_content text,                            -- tiếng Việt, nullable
  translated_at timestamptz,
  translation_api text,                               -- 'gemini' | 'deepseek' | 'qwen' | ...
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (novel_id, chapter_index)
);

-- ============================================================
-- sync_logs: lịch sử cron + sync thủ công
-- ============================================================
create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid references novels(id) on delete cascade,
  action text not null                                -- 'check' | 'update' | 'download'
    check (action in ('check', 'update', 'download')),
  new_chapters integer not null default 0,
  status text not null default 'success'
    check (status in ('success', 'failed')),
  message text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_chapters_novel on chapters(novel_id, chapter_index);
create index if not exists idx_chapters_translated on chapters(novel_id) where translated_content is not null;
create index if not exists idx_novels_book_id on novels(book_id);
create index if not exists idx_novels_updated on novels(last_updated_at desc);
create index if not exists idx_sync_logs_novel on sync_logs(novel_id, created_at desc);

-- Nếu schema đã tạo trước đó, bổ sung cột lưu path EPUB trong Storage.
alter table novels add column if not exists epub_storage_path text;

-- ============================================================
-- View tóm tắt: số chương đã dịch / tổng
-- ============================================================
create or replace view novel_stats as
select
  n.id,
  n.book_id,
  n.title,
  n.author,
  n.cover_url,
  n.epub_storage_path,
  n.total_chapters,
  n.last_updated_at,
  n.status,
  count(c.id) filter (where c.translated_content is not null) as translated_count
from novels n
left join chapters c on c.novel_id = n.id
group by n.id;

-- ============================================================
-- RLS — public read, service-role write
-- ============================================================
alter table novels enable row level security;
alter table chapters enable row level security;
alter table sync_logs enable row level security;

drop policy if exists "Public read novels" on novels;
drop policy if exists "Public read chapters" on chapters;
drop policy if exists "Public read sync_logs" on sync_logs;

create policy "Public read novels" on novels for select using (true);
create policy "Public read chapters" on chapters for select using (true);
create policy "Public read sync_logs" on sync_logs for select using (true);

-- Ghi: chỉ service-role key bypass RLS, không cần policy insert/update.
-- Anon key sẽ KHÔNG thể ghi → an toàn cho frontend public.
