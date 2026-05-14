import { NextResponse } from 'next/server';
import { translateWithRetry } from '@/lib/translate';
import type { TranslateProvider } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      text?: string;
      provider?: TranslateProvider;
      apiKey?: string;
      geminiModel?: string;
      mymemoryEmail?: string;
    };
    if (!body.text) return NextResponse.json({ error: 'text required' }, { status: 400 });
    const p: TranslateProvider = body.provider || 'mymemory';
    const translated = await translateWithRetry(
      p,
      body.text,
      {
        apiKey: body.apiKey,
        geminiModel: body.geminiModel,
        mymemoryEmail: body.mymemoryEmail,
      },
      req.signal
    );
    return NextResponse.json({ translated });
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
