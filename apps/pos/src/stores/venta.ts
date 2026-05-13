import { create } from 'zustand';
import type { Producto } from '@comercio/db';

export type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  precio_unitario: number;
  precio_base: number;
  descuento_pct?: number;
};

export type ModoDescuento = 'pct' | 'monto';

type VentaState = {
  items: ItemCarrito[];
  clienteId: string | null;
  descuentoModo: ModoDescuento;
  descuentoValor: number;
  motivoDescuento?: string;
  agregar: (producto: Producto, precio: number) => void;
  setCantidad: (productoId: string, cantidad: number) => void;
  setPrecio: (productoId: string, precio: number) => void;
  setDescuentoLinea: (productoId: string, pct: number | undefined) => void;
  quitar: (productoId: string) => void;
  setCliente: (id: string | null) => void;
  setDescuento: (modo: ModoDescuento, valor: number, motivo?: string) => void;
  limpiarDescuento: () => void;
  limpiar: () => void;
};

export const useVenta = create<VentaState>((set) => ({
  items: [],
  clienteId: null,
  descuentoModo: 'pct',
  descuentoValor: 0,
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
  setDescuentoLinea: (productoId, pct) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.producto.id === productoId ? { ...i, descuento_pct: pct } : i,
      ),
    })),
  quitar: (productoId) =>
    set((state) => ({ items: state.items.filter((i) => i.producto.id !== productoId) })),
  setCliente: (id) => set({ clienteId: id }),
  setDescuento: (modo, valor, motivo) =>
    set({ descuentoModo: modo, descuentoValor: Math.max(0, valor), motivoDescuento: motivo }),
  limpiarDescuento: () => set({ descuentoValor: 0, motivoDescuento: undefined }),
  limpiar: () =>
    set({
      items: [],
      clienteId: null,
      descuentoModo: 'pct',
      descuentoValor: 0,
      motivoDescuento: undefined,
    }),
}));

export function calcularSubtotal(items: ItemCarrito[]): number {
  return items.reduce((acc, i) => {
    const linea = i.cantidad * i.precio_unitario;
    const dto = i.descuento_pct ? linea * (i.descuento_pct / 100) : 0;
    return acc + linea - dto;
  }, 0);
}

export function calcularDescuentoGlobal(
  subtotal: number,
  modo: ModoDescuento,
  valor: number,
): number {
  if (valor <= 0) return 0;
  if (modo === 'pct') return subtotal * (Math.min(100, valor) / 100);
  return Math.min(subtotal, valor);
}

export function calcularBaseVenta(
  items: ItemCarrito[],
  modo: ModoDescuento,
  valor: number,
): number {
  const subtotal = calcularSubtotal(items);
  return subtotal - calcularDescuentoGlobal(subtotal, modo, valor);
}
