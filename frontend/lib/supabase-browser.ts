import { createClient } from '@supabase/supabase-js';

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} chưa cấu hình`);
  return value;
};

export const supabaseBrowser = () =>
  createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } }
  );
