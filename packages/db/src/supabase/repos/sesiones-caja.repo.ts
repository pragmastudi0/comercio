import type { SupabaseClient } from '@supabase/supabase-js';
import type { SesionesCajaRepo } from '../../repos/sesiones-caja.repo';
import type { MovimientoCaja, SesionCaja } from '../../types';
import { ok, okList, okMaybe } from '../helpers';

export function makeSesionesCajaRepo(sb: SupabaseClient): SesionesCajaRepo {
  return {
    async abrir({ caja_id, empleado_id, saldo_inicial }) {
      // Política Turisteando: permitimos múltiples sesiones abiertas en
      // la misma caja con DISTINTOS empleados (típico: dueño entra a
      // testear o cobrar mientras el cajero también está en la caja, o
      // turnos solapados). El warning amarillo de AbrirCaja avisa al
      // segundo entrante para que coordinen el arqueo. Cada venta queda
      // asociada a la sesión de QUIEN cobró (empleado_id propio), así
      // las cuentas no se mezclan al cierre.
      //
      // Lo único que sí bloqueamos es que el MISMO empleado abra dos
      // sesiones en la misma caja — eso es siempre un error operativo.
      const { data: yaMia } = await sb
        .from('sesiones_caja')
        .select('id')
        .eq('caja_id', caja_id)
        .eq('empleado_id', empleado_id)
        .eq('estado', 'abierta')
        .maybeSingle();
      if (yaMia) throw new Error('Ya tenés una sesión abierta en esta caja');

      return ok<SesionCaja>(
        await sb
          .from('sesiones_caja')
          .insert({ caja_id, empleado_id, saldo_inicial, estado: 'abierta' })
          .select('*')
          .single(),
        'sesiones_caja.abrir',
      );
    },
    async cerrar(id, saldoFinalDeclarado) {
      // Filtramos por estado=abierta para prevenir doble cierre silencioso
      // (caso típico: el admin cierra la sesión desde /admin/caja y el
      // cajero la cierra desde el PoS simultáneamente — sin este filtro,
      // el segundo update pasaba sin error pero no afectaba nada).
      //
      // Usamos .select() que devuelve array (no .maybeSingle): así
      // distinguimos "0 filas afectadas → ya estaba cerrada" sin caer en
      // los quirks de PostgREST que a veces tira "Cannot coerce to single
      // JSON object" cuando maybeSingle recibe 0 rows con ciertos headers.
      const { data: filas, error } = await sb
        .from('sesiones_caja')
        .update({
          estado: 'cerrada',
          cerrada_en: new Date().toISOString(),
          saldo_final_declarado: saldoFinalDeclarado,
        })
        .eq('id', id)
        .eq('estado', 'abierta')
        .select('*');
      if (error) throw new Error(`sesiones_caja.cerrar: ${error.message}`);
      if (!filas || filas.length === 0) {
        // No es un error de bug — es una condición esperada (admin y cajero
        // cerraron la misma sesión "en simultáneo"). El UI distingue este
        // caso por el `name` para mostrarlo como info amigable, no rojo.
        const err = new Error(
          'Esta caja ya había sido cerrada (alguien la cerró antes).',
        );
        err.name = 'SesionYaCerrada';
        throw err;
      }
      return filas[0] as SesionCaja;
    },
    async sesionActivaDe(empleadoId, cajaId) {
      return okMaybe<SesionCaja>(
        await sb
          .from('sesiones_caja')
          .select('*')
          .eq('empleado_id', empleadoId)
          .eq('caja_id', cajaId)
          .eq('estado', 'abierta')
          .maybeSingle(),
        'sesiones_caja.sesionActivaDe',
      );
    },
    async list(filtro = {}) {
      let q = sb.from('sesiones_caja').select('*').order('abierta_en', { ascending: false });
      if (filtro.caja_id) q = q.eq('caja_id', filtro.caja_id);
      if (filtro.empleado_id) q = q.eq('empleado_id', filtro.empleado_id);
      if (filtro.desde) q = q.gte('abierta_en', filtro.desde);
      if (filtro.hasta) q = q.lte('abierta_en', filtro.hasta);
      let rows = okList<SesionCaja>(await q, 'sesiones_caja.list');
      if (filtro.local_id) {
        const { data: cajas } = await sb
          .from('cajas')
          .select('id')
          .eq('local_id', filtro.local_id);
        const ids = new Set((cajas ?? []).map((c) => c.id));
        rows = rows.filter((s) => ids.has(s.caja_id));
      }
      return rows;
    },
    async get(id) {
      return okMaybe<SesionCaja>(
        await sb.from('sesiones_caja').select('*').eq('id', id).maybeSingle(),
        'sesiones_caja.get',
      );
    },
    async movimientos(sesionId) {
      return okList<MovimientoCaja>(
        await sb
          .from('movimientos_caja')
          .select('*')
          .eq('sesion_caja_id', sesionId)
          .order('fecha'),
        'sesiones_caja.movimientos',
      );
    },
    async registrarMovimiento(input) {
      return ok<MovimientoCaja>(
        await sb.from('movimientos_caja').insert(input).select('*').single(),
        'sesiones_caja.registrarMovimiento',
      );
    },
    async actualizarSaldoInicial(id, nuevoSaldoInicial) {
      return ok<SesionCaja>(
        await sb
          .from('sesiones_caja')
          .update({ saldo_inicial: nuevoSaldoInicial })
          .eq('id', id)
          .eq('estado', 'abierta')
          .select('*')
          .single(),
        'sesiones_caja.actualizarSaldoInicial',
      );
    },
  };
}
