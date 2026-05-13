import { createClient } from '@supabase/supabase-js';

// Server-side: anon key cho read, service key cho write.
// Tách 2 client để không lỡ tay leak service key qua read API public.

export const supabaseAnon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

export const supabaseService = () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY chưa cấu hình');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
};
