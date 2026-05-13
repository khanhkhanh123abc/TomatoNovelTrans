import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { chapter_id, translated_content, translation_api } = await req.json();
    if (!chapter_id || !translated_content) {
      return NextResponse.json({ error: 'chapter_id + translated_content required' }, { status: 400 });
    }
    const supa = supabaseService();
    const { error } = await supa
      .from('chapters')
      .update({
        translated_content,
        translation_api: translation_api || null,
        translated_at: new Date().toISOString(),
      })
      .eq('id', chapter_id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
