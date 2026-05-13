import { createClient } from '@supabase/supabase-js';

// Server-side: anon key cho read, service key cho write.
// Tách 2 client để không lỡ tay leak service key qua read API public.

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} chưa cấu hình`);
  return value;
};

export const supabaseAnon = () =>
  createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } }
  );

export const supabaseService = () => {
  const key = requiredEnv('SUPABASE_SERVICE_KEY');
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), key, {
    auth: { persistSession: false },
  });
};
