import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cache de instancias por `url + storageKey`. Supabase recomienda
 * EXPRESAMENTE no instanciar `createClient()` más de una vez por par
 * (url, storageKey) en la misma página — si hay dos clientes con la
 * misma storageKey, ambos intentan refrescar el JWT en paralelo,
 * compiten por el lock del storage y la sesión "muere" sin aviso a
 * los pocos minutos.
 *
 * Históricamente esta función creaba un cliente nuevo en cada llamada,
 * y cada app llamaba desde varios lugares (providers, getDb, helper
 * de upload, logout, etc.). El bug "sesión expira sola a los 2 min"
 * venía de ahí. Solución: singleton por par.
 */
const cache = new Map<string, SupabaseClient>();

/**
 * Devuelve el cliente Supabase para esas credenciales (singleton por
 * url + storageKey). Las apps lo importan con sus propias env vars
 * (NEXT_PUBLIC_* para admin/web, VITE_* para pos).
 *
 * `storageKey` se puede pasar para que las distintas apps (admin, pos,
 * web) mantengan sesiones separadas si convive más de una en el mismo
 * dominio. Si no se pasa, usa el default de supabase-js.
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
  const cacheKey = `${url}|${opts?.storageKey ?? '_default'}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const client = createClient(url, anonKey, {
    auth: {
      // Mantener sesión en localStorage entre recargas.
      persistSession: true,
      // Refrescar el JWT de Supabase Auth en background antes de expirar.
      // Sin esto, después de ~1h las queries empiezan a tirar 401 y la app
      // parece "se desconectó solo".
      autoRefreshToken: true,
      // Detectar el token en la URL al volver del flow PKCE.
      detectSessionInUrl: true,
      // Flow recomendado para SPAs.
      flowType: 'pkce',
      ...(opts?.storageKey ? { storageKey: opts.storageKey } : {}),
    },
  });
  cache.set(cacheKey, client);
  return client;
}

export type { SupabaseClient };
