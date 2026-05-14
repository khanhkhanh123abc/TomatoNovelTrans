'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { buildBatches, PROVIDER_DELAY } from '@/lib/translate';
import type { Novel, ChapterMeta } from '@/lib/types';
import SettingsModal from '@/app/components/SettingsModal';
import {
  loadSettings,
  saveSettings,
  getProviderOverrides,
  DEFAULT_SETTINGS,
  type ClientSettings,
} from '@/lib/client-settings';

type Props = {
  novel: Novel;
  chapters: ChapterMeta[];
};

export default function Reader({ novel, chapters }: Props) {
  const router = useRouter();
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Nội dung chương hiện tại
  const [originalContent, setOriginalContent] = useState<string>('');
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(false);

  // Trạng thái dịch
  const [translating, setTranslating] = useState<{ progress: number } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [settings, setSettings] = useState<ClientSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

  // Load settings từ localStorage sau khi mount (tránh SSR mismatch).
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSaveSettings = (s: ClientSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const current = chapters[selectedIdx];

  // Load nội dung chương khi chọn
  useEffect(() => {
    if (!current) return;
    setLoadingChapter(true);
    setOriginalContent('');
    setTranslatedContent(null);
    setShowOriginal(false);

    const supa = supabaseBrowser();
    supa
      .from('chapters')
      .select('content, translated_content')
      .eq('id', current.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setOriginalContent('Lỗi tải chương: ' + (error?.message || 'unknown'));
        } else {
          setOriginalContent(data.content);
          setTranslatedContent(data.translated_content);
          setShowOriginal(!data.translated_content);
        }
        setLoadingChapter(false);
      });

    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [current?.id]);

  const translatedSet = useMemo(
    () => new Set(chapters.filter((c) => c.translated_content).map((c) => c.id)),
    [chapters]
  );

  const blocks = useMemo(
    () => originalContent.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
    [originalContent]
  );

  const startTranslate = useCallback(async () => {
    if (!current || !originalContent) return;

    const provider = settings.provider;
    const overrides = getProviderOverrides(settings);
    const batches = buildBatches(blocks, provider);
    if (!batches.length) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setTranslating({ progress: 0 });
    setShowOriginal(false);
    const collected: string[] = [];
    setTranslatedContent('');

    try {
      for (let i = 0; i < batches.length; i++) {
        if (controller.signal.aborted) break;
        const text = batches[i].join('\n\n');
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, provider, ...overrides }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        collected.push(data.translated);
        setTranslatedContent(collected.join('\n\n'));
        setTranslating({ progress: ((i + 1) / batches.length) * 100 });

        if (i < batches.length - 1) {
          await new Promise((r) => setTimeout(r, PROVIDER_DELAY[provider]));
        }
      }

      if (!controller.signal.aborted) {
        const finalText = collected.join('\n\n');
        // Lưu vào Supabase
        await fetch('/api/save-translation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapter_id: current.id,
            translated_content: finalText,
            translation_api: provider,
          }),
        });
        // Cập nhật mục lục
        router.refresh();
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        alert('Lỗi dịch: ' + (e as Error).message);
      }
    } finally {
      setTranslating(null);
      abortRef.current = null;
    }
  }, [current, originalContent, blocks, settings, router]);

  const stopTranslate = () => abortRef.current?.abort();

  const checkUpdates = async () => {
    setSyncStatus('Đang kiểm tra...');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: novel.book_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi');
      const n = data.newChapters || 0;
      setSyncStatus(n > 0 ? `+${n} chương mới` : 'Đã mới nhất');
      if (n > 0) router.refresh();
    } catch (e) {
      setSyncStatus('Lỗi: ' + (e as Error).message);
    }
    setTimeout(() => setSyncStatus(''), 4000);
  };

  const goPrev = () => selectedIdx > 0 && setSelectedIdx(selectedIdx - 1);
  const goNext = () => selectedIdx < chapters.length - 1 && setSelectedIdx(selectedIdx + 1);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 md:px-5 py-3 border-b border-slate-800">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden text-slate-300 hover:text-slate-100"
          aria-label="Mở mục lục"
        >
          ☰
        </button>
        <Link href="/" className="text-slate-400 hover:text-slate-100 text-sm">
          ← Kho
        </Link>
        <h1 className="flex-1 truncate font-semibold">{novel.title}</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">{settings.provider}</span>
        <button
          onClick={() => setSettingsOpen(true)}
          disabled={!!translating}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm disabled:opacity-50"
          title="Cài đặt API key"
        >
          ⚙️
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 bg-black/60 z-20" onClick={() => setSidebarOpen(false)} />
        )}
        <aside
          className={`fixed md:static top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-800 z-30 transform transition-transform md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } flex flex-col`}
        >
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Mục lục</span>
              <span className="text-xs text-slate-500">{chapters.length} chương</span>
            </div>
            <button
              onClick={checkUpdates}
              className="w-full px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg"
            >
              🔄 Kiểm tra cập nhật {syncStatus && <span className="text-emerald-400">— {syncStatus}</span>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chapters.map((ch, i) => {
              const isSelected = i === selectedIdx;
              const isTranslated = translatedSet.has(ch.id);
              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    setSelectedIdx(i);
                    setSidebarOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-800/60 flex items-start gap-2 ${
                    isSelected
                      ? 'bg-emerald-900/40 text-emerald-200 border-l-4 border-l-emerald-400'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="text-xs text-slate-500 w-6 shrink-0 pt-0.5">{i + 1}</span>
                  <span className="flex-1 text-sm leading-snug break-words">{ch.title}</span>
                  {isTranslated && <span className="text-emerald-400 shrink-0">✓</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 md:px-8 py-3 flex flex-wrap items-center gap-2">
            <button
              onClick={goPrev}
              disabled={selectedIdx === 0 || !!translating}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-40"
            >
              ⬅ Trước
            </button>
            <button
              onClick={goNext}
              disabled={selectedIdx >= chapters.length - 1 || !!translating}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-40"
            >
              Sau ➡
            </button>
            <div className="flex-1" />
            {translatedContent && !translating && (
              <button
                onClick={() => setShowOriginal((s) => !s)}
                className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                {showOriginal ? '中 → Vi' : 'Vi → 中'}
              </button>
            )}
            {!translating ? (
              <button
                onClick={startTranslate}
                disabled={loadingChapter || !originalContent}
                className="px-4 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
              >
                🔄 {translatedContent ? 'Dịch lại' : 'Dịch chương'}
              </button>
            ) : (
              <button
                onClick={stopTranslate}
                className="px-4 py-1.5 text-sm font-medium bg-rose-600 hover:bg-rose-500 rounded-lg"
              >
                ⏹ Dừng
              </button>
            )}
          </div>

          {/* Progress */}
          {translating && (
            <div className="px-4 md:px-8 py-2 bg-slate-900 border-b border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Đang dịch...</span>
                <span>{Math.round(translating.progress)}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                  style={{ width: `${translating.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Body */}
          <div ref={contentRef} className="flex-1 overflow-y-auto">
            <article className="max-w-3xl mx-auto px-4 md:px-8 py-8 font-reader text-[17px] leading-[1.85] reader">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-100 mb-6">
                {current?.title || '—'}
              </h2>

              {loadingChapter ? (
                <p className="text-slate-500">Đang tải nội dung…</p>
              ) : showOriginal || !translatedContent ? (
                originalContent.split(/\n{2,}/).map((p, i) => p.trim() && <p key={i}>{p.trim()}</p>)
              ) : (
                <>
                  {translatedContent
                    .split(/\n{2,}/)
                    .map((p, i) => p.trim() && <p key={i} className="fade-in">{p.trim()}</p>)}
                  {translating && <p className="text-slate-500 italic">▍ đang dịch tiếp...</p>}
                </>
              )}
            </article>
          </div>
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
