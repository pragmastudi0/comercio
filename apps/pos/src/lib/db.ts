import { createMockClient, type DbClient } from '@comercio/db';

let _client: DbClient | null = null;

export function getDb(): DbClient {
  if (!_client) _client = createMockClient();
  return _client;
}
