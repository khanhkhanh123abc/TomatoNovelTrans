import { createClient } from '@supabase/supabase-js';

// QUAN TRỌNG: truy cập STATIC `process.env.NEXT_PUBLIC_*` để Next.js
// webpack inline value vào client bundle ở build time. Truy cập dynamic
// như `process.env[name]` qua biến sẽ KHÔNG được replace → client bundle
// có `undefined` runtime.
export const supabaseBrowser = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL chưa cấu hình');
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY chưa cấu hình');
  return createClient(url, key, { auth: { persistSession: false } });
};
