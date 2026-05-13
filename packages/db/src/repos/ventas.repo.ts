import type { ID, Venta } from '../types';

export type FiltroVentas = {
  desde?: string;
  hasta?: string;
  local_id?: ID;
  caja_id?: ID;
  empleado_id?: ID;
  cliente_id?: ID;
  estado?: Venta['estado'];
};

export type VentasRepo = {
  list(filtro?: FiltroVentas): Promise<Venta[]>;
  get(id: ID): Promise<Venta | null>;
  // Crea la venta, descuenta stock y registra el movimiento de caja en la sesión activa.
  crear(input: Omit<Venta, 'id' | 'numero' | 'estado' | 'fecha'>): Promise<Venta>;
  anular(id: ID, empleadoId: ID, motivo: string): Promise<Venta>;
  // Devuelve un "presupuesto": misma forma que venta pero no descuenta stock ni afecta caja.
  presupuesto(input: Omit<Venta, 'id' | 'numero' | 'estado' | 'fecha'>): Promise<Venta>;
};
