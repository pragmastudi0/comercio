import type { ID, Transferencia } from '../types';

export type TransferenciasRepo = {
  list(filtro?: { estado?: Transferencia['estado']; deposito_id?: ID }): Promise<Transferencia[]>;
  get(id: ID): Promise<Transferencia | null>;
  crearBorrador(input: Omit<Transferencia, 'id' | 'estado' | 'creada_en'>): Promise<Transferencia>;
  emitir(id: ID, empleadoId: ID): Promise<Transferencia>;
  recibir(id: ID, empleadoId: ID): Promise<Transferencia>;
  anular(id: ID, empleadoId: ID, motivo: string): Promise<Transferencia>;
};
