import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Crea un cliente Supabase con las env vars. Las apps lo importan con sus
 * propias env vars (NEXT_PUBLIC_* para admin/web, VITE_* para pos).
 */
export function createSupabaseRaw(url: string, anonKey: string): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Setealas como env vars en la app.',
    );
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export type { SupabaseClient };
