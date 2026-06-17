import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Crea un cliente Supabase con las env vars. Las apps lo importan con sus
 * propias env vars (NEXT_PUBLIC_* para admin/web, VITE_* para pos).
 *
 * `storageKey` se puede pasar para que las distintas apps (admin, pos, web)
 * mantengan sesiones separadas si convive más de una en el mismo dominio.
 * Si no se pasa, usa el default de supabase-js (`sb-{project}-auth-token`).
 */
export function createSupabaseRaw(
  url: string,
  anonKey: string,
  opts?: { storageKey?: string },
): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Setealas como env vars en la app.',
    );
  }
  return createClient(url, anonKey, {
    auth: {
      // Mantener sesión en localStorage entre recargas.
      persistSession: true,
      // Refrescar el JWT de Supabase Auth en background antes de expirar.
      // Sin esto, después de ~1h las queries empiezan a tirar 401 y la app
      // parece "se desconectó solo".
      autoRefreshToken: true,
      // Flow recomendado para SPAs.
      flowType: 'pkce',
      ...(opts?.storageKey ? { storageKey: opts.storageKey } : {}),
    },
  });
}

export type { SupabaseClient };
