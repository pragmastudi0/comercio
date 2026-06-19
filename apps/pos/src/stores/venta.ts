import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Producto } from '@comercio/db';

/** Precio mínimo permitido por línea. Evita ventas accidentales a $0 o
 * con número negativo (un cero de más en el input editable). */
const PRECIO_MINIMO = 0.01;

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

export const useVenta = create<VentaState>()(
  persist(
    (set) => ({
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
          // Si el precio del producto es 0 (ej. mal seteado en catálogo),
          // forzamos al mínimo. Mejor evidente al cajero que silenciado.
          const precioOk = Math.max(PRECIO_MINIMO, precio);
          return {
            items: [
              ...state.items,
              { producto, cantidad: 1, precio_unitario: precioOk, precio_base: precioOk },
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
          // Bloqueamos precios ≤ 0. Si el cajero edita y borra el campo,
          // el input vuelve al mínimo en lugar de quedar en 0/negativo.
          items: state.items.map((i) =>
            i.producto.id === productoId
              ? { ...i, precio_unitario: Math.max(PRECIO_MINIMO, precio) }
              : i,
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
    }),
    {
      // Persistimos el carrito en localStorage para que si se cae el
      // navegador (corte de luz, recarga accidental, redeploy de Vercel)
      // el cajero recupere lo que estaba armando. No persistimos la
      // sesión Supabase ni los productos completos: solo lo del carrito.
      name: 'turisteando-pos-carrito',
      version: 1,
      partialize: (s) => ({
        items: s.items,
        clienteId: s.clienteId,
        descuentoModo: s.descuentoModo,
        descuentoValor: s.descuentoValor,
        motivoDescuento: s.motivoDescuento,
      }),
    },
  ),
);

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
