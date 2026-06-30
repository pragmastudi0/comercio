import type { ID, MovimientoCaja, SesionCaja } from '../types';

export type SesionesCajaRepo = {
  abrir(input: { caja_id: ID; empleado_id: ID; saldo_inicial: number }): Promise<SesionCaja>;
  cerrar(id: ID, saldoFinalDeclarado: number): Promise<SesionCaja>;
  sesionActivaDe(empleadoId: ID, cajaId: ID): Promise<SesionCaja | null>;
  list(filtro?: { caja_id?: ID; local_id?: ID; empleado_id?: ID; desde?: string; hasta?: string }): Promise<SesionCaja[]>;
  get(id: ID): Promise<SesionCaja | null>;
  movimientos(sesionId: ID): Promise<MovimientoCaja[]>;
  registrarMovimiento(input: Omit<MovimientoCaja, 'id' | 'fecha'>): Promise<MovimientoCaja>;
  /**
   * Corrige el saldo inicial de una sesión ya abierta. Útil cuando el
   * cajero declaró un monto erróneo al abrir y quiere ajustarlo sin
   * cerrar/reabrir la caja. Devuelve la sesión actualizada.
   */
  actualizarSaldoInicial?(id: ID, nuevoSaldoInicial: number): Promise<SesionCaja>;
};
