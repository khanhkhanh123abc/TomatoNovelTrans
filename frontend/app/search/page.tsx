'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SearchResult } from '@/lib/types';

export default function SearchPage() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const search = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tìm kiếm');
      setResults(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addNovel = async (r: SearchResult) => {
    setAdding(r.book_id);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: r.book_id,
          title: r.title,
          author: r.author,
          cover_url: r.cover_url,
          description: r.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi thêm');
      setAdded((prev) => new Set(prev).add(r.book_id));
    } catch (e) {
      alert('Lỗi: ' + (e as Error).message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <main className="min-h-screen px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔍 Tìm Truyện Mới</h1>
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">
          ← Về kho truyện
        </Link>
      </header>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Nhập tên truyện tiếng Trung..."
          className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? '⏳' : '🔍 Tìm'}
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-rose-900/30 border border-rose-700 rounded-lg text-rose-200 text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="space-y-2">
        {results.map((r) => {
          const isAdded = added.has(r.book_id);
          return (
            <div
              key={r.book_id}
              className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-lg"
            >
              <div className="w-12 h-16 bg-slate-700 rounded shrink-0 overflow-hidden">
                {r.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.cover_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-slate-100 truncate">{r.title}</h3>
                <p className="text-xs text-slate-400 truncate">
                  {r.author || 'Không rõ tác giả'}
                  {r.total_chapters ? ` · ${r.total_chapters} chương` : ''}
                </p>
              </div>
              <button
                onClick={() => addNovel(r)}
                disabled={adding === r.book_id || isAdded}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                  isAdded
                    ? 'bg-emerald-900/40 text-emerald-300 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50'
                }`}
              >
                {isAdded ? '✓ Đã thêm' : adding === r.book_id ? '⏳' : '➕ Thêm'}
              </button>
            </div>
          );
        })}
        {!loading && results.length === 0 && keyword && !error && (
          <p className="text-center text-slate-500 py-8">Không có kết quả</p>
        )}
      </div>
    </main>
  );
}
