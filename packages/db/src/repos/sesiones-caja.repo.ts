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
  /**
   * Cierra todas las OTRAS sesiones abiertas en la misma caja física,
   * excepto la especificada. Se usa después de cerrar la sesión activa
   * para consolidar el cierre cuando había multi-sesión (feature iter-2):
   * si dos cajeros compartieron una caja durante un cambio de turno,
   * cerrar UNA no cerraba las otras y quedaban sesiones fantasma.
   *
   * Las otras sesiones se cierran con saldo_final_declarado = null
   * (nadie declaró explícitamente su cierre — quedó implícito). Devuelve
   * la cantidad de sesiones que efectivamente se cerraron.
   */
  cerrarOtrasSesionesEnCaja?(cajaId: ID, exceptoSesionId: ID): Promise<number>;
};
