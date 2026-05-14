import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Producto } from '@comercio/db';

export type ItemCarritoWeb = {
  productoId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  /** Escalas de precio que aplica el cliente, snapshot del momento. */
  escalas: { desde: number; precio: number }[];
};

type CarritoState = {
  items: ItemCarritoWeb[];
  agregar: (
    producto: Pick<Producto, 'id' | 'codigo_interno' | 'nombre'>,
    escalas: { desde: number; precio: number }[],
    cantidad?: number,
  ) => void;
  setCantidad: (productoId: string, cantidad: number) => void;
  quitar: (productoId: string) => void;
  vaciar: () => void;
};

export const useCarrito = create<CarritoState>()(
  persist(
    (set) => ({
      items: [],
      agregar: (producto, escalas, cantidad = 1) =>
        set((s) => {
          const existente = s.items.find((i) => i.productoId === producto.id);
          if (existente) {
            return {
              items: s.items.map((i) =>
                i.productoId === producto.id ? { ...i, cantidad: i.cantidad + cantidad } : i,
              ),
            };
          }
          return {
            items: [
              ...s.items,
              {
                productoId: producto.id,
                codigo: producto.codigo_interno,
                nombre: producto.nombre,
                cantidad,
                escalas,
              },
            ],
          };
        }),
      setCantidad: (productoId, cantidad) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.productoId === productoId ? { ...i, cantidad } : i))
            .filter((i) => i.cantidad > 0),
        })),
      quitar: (productoId) =>
        set((s) => ({ items: s.items.filter((i) => i.productoId !== productoId) })),
      vaciar: () => set({ items: [] }),
    }),
    { name: 'turisteando-web-carrito' },
  ),
);

/** Devuelve el precio aplicable a esa cantidad según las escalas. */
export function precioPorCantidad(
  escalas: { desde: number; precio: number }[],
  cantidad: number,
): number {
  if (escalas.length === 0 || cantidad <= 0) return 0;
  let aplicado = escalas[0]!.precio;
  for (const e of escalas) {
    if (cantidad >= e.desde) aplicado = e.precio;
    else break;
  }
  return aplicado;
}

export function subtotalDeItem(item: ItemCarritoWeb): number {
  return item.cantidad * precioPorCantidad(item.escalas, item.cantidad);
}

export function totalCarrito(items: ItemCarritoWeb[]): number {
  return items.reduce((acc, i) => acc + subtotalDeItem(i), 0);
}
