import type { PostgrestError } from '@supabase/supabase-js';

type RowResp<T> = { data: T | null; error: PostgrestError | null };
type ListResp<T> = { data: T[] | null; error: PostgrestError | null };

/** Lanza un Error legible si la respuesta de Supabase trae error. */
export function ok<T>(res: RowResp<T>, ctx?: string): T {
  if (res.error) throw new Error(`${ctx ? ctx + ': ' : ''}${res.error.message}`);
  if (res.data === null || res.data === undefined) {
    throw new Error(`${ctx ? ctx + ': ' : ''}sin datos`);
  }
  return res.data;
}

/** Variante para listados: data puede ser [] (válido). */
export function okList<T>(res: ListResp<T>, ctx?: string): T[] {
  if (res.error) throw new Error(`${ctx ? ctx + ': ' : ''}${res.error.message}`);
  return res.data ?? [];
}

/** Para single()/maybeSingle() que puede devolver null si no existe. */
export function okMaybe<T>(res: RowResp<T>, ctx?: string): T | null {
  if (res.error) {
    // PGRST116 = no rows returned
    if (res.error.code === 'PGRST116') return null;
    throw new Error(`${ctx ? ctx + ': ' : ''}${res.error.message}`);
  }
  return res.data;
}
