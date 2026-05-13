import { NextResponse } from 'next/server';
import { azurePost } from '@/lib/azure';

export const runtime = 'nodejs';

// POST /api/sync { book_id?: string }
//  - Có book_id: kiểm tra cập nhật 1 truyện (đồng bộ, đợi kết quả)
//  - Không: trigger sync-all (bất đồng bộ trên backend)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const bookId = body.book_id as string | undefined;
    const data = bookId
      ? await azurePost(`/api/novels/${encodeURIComponent(bookId)}/sync`)
      : await azurePost('/api/sync/all');
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
