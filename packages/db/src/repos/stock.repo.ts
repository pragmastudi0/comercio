import type { ID, MovimientoStock, StockItem } from '../types';

export type StockRepo = {
  // Lectura
  porProducto(productoId: ID): Promise<StockItem[]>; // todos los depósitos
  porDeposito(depositoId: ID): Promise<StockItem[]>;
  cantidad(productoId: ID, depositoId: ID, varianteId?: ID): Promise<number>;
  consolidado(filtro?: { producto_id?: ID; deposito_id?: ID; sin_stock?: boolean }): Promise<StockItem[]>;

  // Movimientos
  ajustar(input: { producto_id: ID; variante_id?: ID; deposito_id: ID; cantidad: number; motivo: string; empleado_id: ID }): Promise<MovimientoStock>;
  registrarMerma(input: { producto_id: ID; variante_id?: ID; deposito_id: ID; cantidad: number; motivo: string; empleado_id: ID }): Promise<MovimientoStock>;
  // Llamado por VentasRepo. Falla si no hay stock y el llamante no autoriza vender sin stock.
  descontarPorVenta(input: { producto_id: ID; variante_id?: ID; deposito_id: ID; cantidad: number; venta_id: ID; empleado_id: ID; permitirSinStock: boolean }): Promise<MovimientoStock>;

  movimientos(filtro?: { producto_id?: ID; deposito_id?: ID; desde?: string; hasta?: string }): Promise<MovimientoStock[]>;
};
