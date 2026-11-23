import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const isHomolog =
  import.meta.env.VITE_APP_ENV === 'homolog' ||
  (typeof window !== 'undefined' &&
    window.location.pathname.includes('/homolog'));

export const storagePrefix = isHomolog ? 'homolog:' : '';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}
