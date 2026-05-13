// Lógica pura de precios: escalas por cantidad, descuento efectivo, recargo por cuotas.

export type EscalaPrecio = {
  desde: number; // cantidad mínima (inclusive)
  precio: number;
};

export type ListaPrecio = {
  id: string;
  nombre: string;
  escalas: EscalaPrecio[]; // ordenadas asc por `desde`
};

export type CuotaConfig = {
  cuotas: number;
  recargoPct: number; // recargo % aplicado al total
};

export type ConfigPagos = {
  descuentoEfectivoPct: number; // p.ej. 10 = 10% off
  cuotas: CuotaConfig[];
};

export function precioPorCantidad(lista: ListaPrecio, cantidad: number): number {
  if (cantidad <= 0) return 0;
  // Asume escalas ordenadas asc por desde; busca la última que cumple desde <= cantidad.
  let aplicado = lista.escalas[0]?.precio ?? 0;
  for (const e of lista.escalas) {
    if (cantidad >= e.desde) aplicado = e.precio;
    else break;
  }
  return aplicado;
}

export function aplicarDescuentoEfectivo(subtotal: number, config: ConfigPagos): number {
  const pct = config.descuentoEfectivoPct ?? 0;
  return redondear2(subtotal * (1 - pct / 100));
}

export function aplicarRecargoCuotas(
  subtotal: number,
  cuotas: number,
  config: ConfigPagos,
): { total: number; recargoPct: number } {
  const conf = config.cuotas.find((c) => c.cuotas === cuotas);
  const recargoPct = conf?.recargoPct ?? 0;
  return { total: redondear2(subtotal * (1 + recargoPct / 100)), recargoPct };
}

export function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}
