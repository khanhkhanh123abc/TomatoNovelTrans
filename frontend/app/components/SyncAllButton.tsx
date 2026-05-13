'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SyncAllButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const handle = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi');
      setMsg(data.message || 'Đã trigger sync');
      setTimeout(() => router.refresh(), 1000);
    } catch (e) {
      setMsg('Lỗi: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-slate-400">{msg}</span>}
      <button
        onClick={handle}
        disabled={loading}
        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50"
      >
        {loading ? '⏳ Đang…' : '🔄 Cập nhật tất cả'}
      </button>
    </div>
  );
}
