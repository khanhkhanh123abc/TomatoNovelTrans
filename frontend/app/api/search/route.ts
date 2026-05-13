import { NextResponse } from 'next/server';
import { azureGet, azurePost } from '@/lib/azure';

export const runtime = 'nodejs';

// GET /api/search?keyword=... → proxy tới Azure /api/search
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const keyword = url.searchParams.get('keyword') || '';
    if (!keyword.trim()) return NextResponse.json({ error: 'keyword required' }, { status: 400 });
    const data = await azureGet('/api/search', { keyword });
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/search/add → tạo truyện mới
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await azurePost('/api/novels/add', body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
