import Link from 'next/link';
import type { Novel } from '@/lib/types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

export default function NovelCard({ novel }: { novel: Novel }) {
  return (
    <Link
      href={`/novels/${novel.id}`}
      className="group rounded-xl overflow-hidden bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500 transition-all"
    >
      <div className="aspect-[2/3] bg-slate-700 relative overflow-hidden">
        {novel.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={novel.cover_url}
            alt={novel.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-4xl">📖</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-slate-100 line-clamp-2 mb-1" title={novel.title}>
          {novel.title}
        </h3>
        {novel.author && <p className="text-xs text-slate-400 truncate">{novel.author}</p>}
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>{novel.total_chapters} chương</span>
          <span>🔄 {timeAgo(novel.last_updated_at)}</span>
        </div>
      </div>
    </Link>
  );
}
