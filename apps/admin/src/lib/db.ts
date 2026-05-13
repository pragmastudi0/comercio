import { createMockClient, type DbClient } from '@comercio/db';

// Singleton del cliente. Día 4+ se reemplaza por la implementación contra Supabase.
let _client: DbClient | null = null;

export function getDb(): DbClient {
  if (!_client) _client = createMockClient();
  return _client;
}
