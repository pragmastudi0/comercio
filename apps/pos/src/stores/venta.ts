import { create } from 'zustand';
import type { Producto } from '@comercio/db';

export type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  precio_unitario: number; // editable inline
  precio_base: number; // precio original sin modificar
  descuento_pct?: number;
};

type VentaState = {
  items: ItemCarrito[];
  clienteId: string | null;
  descuentoGlobalPct: number; // descuento aplicado sobre el subtotal
  motivoDescuento?: string;
  agregar: (producto: Producto, precio: number) => void;
  setCantidad: (productoId: string, cantidad: number) => void;
  setPrecio: (productoId: string, precio: number) => void;
  setDescuento: (productoId: string, pct: number | undefined) => void;
  quitar: (productoId: string) => void;
  setCliente: (id: string | null) => void;
  setDescuentoGlobal: (pct: number, motivo?: string) => void;
  limpiar: () => void;
};

export const useVenta = create<VentaState>((set) => ({
  items: [],
  clienteId: null,
  descuentoGlobalPct: 0,
  motivoDescuento: undefined,
  agregar: (producto, precio) =>
    set((state) => {
      const existente = state.items.find((i) => i.producto.id === producto.id);
      if (existente) {
        return {
          items: state.items.map((i) =>
            i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          { producto, cantidad: 1, precio_unitario: precio, precio_base: precio },
        ],
      };
    }),
  setCantidad: (productoId, cantidad) =>
    set((state) => ({
      items: state.items
        .map((i) => (i.producto.id === productoId ? { ...i, cantidad } : i))
        .filter((i) => i.cantidad > 0),
    })),
  setPrecio: (productoId, precio) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.producto.id === productoId ? { ...i, precio_unitario: precio } : i,
      ),
    })),
  setDescuento: (productoId, pct) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.producto.id === productoId ? { ...i, descuento_pct: pct } : i,
      ),
    })),
  quitar: (productoId) =>
    set((state) => ({ items: state.items.filter((i) => i.producto.id !== productoId) })),
  setCliente: (id) => set({ clienteId: id }),
  setDescuentoGlobal: (pct, motivo) =>
    set({ descuentoGlobalPct: Math.max(0, Math.min(100, pct)), motivoDescuento: motivo }),
  limpiar: () =>
    set({ items: [], clienteId: null, descuentoGlobalPct: 0, motivoDescuento: undefined }),
}));

export function calcularSubtotal(items: ItemCarrito[]): number {
  return items.reduce((acc, i) => {
    const linea = i.cantidad * i.precio_unitario;
    const dto = i.descuento_pct ? linea * (i.descuento_pct / 100) : 0;
    return acc + linea - dto;
  }, 0);
}

export function calcularDescuentoGlobal(subtotal: number, descuentoGlobalPct: number): number {
  return subtotal * (descuentoGlobalPct / 100);
}

export function calcularBaseVenta(items: ItemCarrito[], descuentoGlobalPct: number): number {
  const subtotal = calcularSubtotal(items);
  return subtotal - calcularDescuentoGlobal(subtotal, descuentoGlobalPct);
}
