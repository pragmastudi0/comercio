// Operaciones de stock sin acceso a DB.

export type MovimientoStock =
  | { tipo: 'venta'; cantidad: number }
  | { tipo: 'devolucion'; cantidad: number }
  | { tipo: 'ajuste'; cantidad: number; motivo: string }
  | { tipo: 'merma'; cantidad: number; motivo: string }
  | { tipo: 'transferencia_salida'; cantidad: number; depositoDestino: string }
  | { tipo: 'transferencia_entrada'; cantidad: number; depositoOrigen: string };

export function aplicarMovimiento(stockActual: number, mov: MovimientoStock): number {
  switch (mov.tipo) {
    case 'venta':
    case 'transferencia_salida':
    case 'merma':
      return stockActual - mov.cantidad;
    case 'devolucion':
    case 'transferencia_entrada':
      return stockActual + mov.cantidad;
    case 'ajuste':
      return stockActual + mov.cantidad; // ajuste puede ser positivo o negativo
  }
}

export function puedeDescontar(
  stockActual: number,
  cantidad: number,
  permiteSinStock: boolean,
): boolean {
  if (cantidad <= 0) return false;
  if (permiteSinStock) return true;
  return stockActual >= cantidad;
}
