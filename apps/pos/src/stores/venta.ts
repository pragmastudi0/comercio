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
  /** Id del producto resaltado en el carrito. Se usa para que la cajera
   * pueda seleccionar una fila (clic o teclado) y borrarla con Supr/Del.
   * Se auto-asigna al último agregado y se desplaza al vecino al quitar. */
  seleccionadoId: string | null;
  descuentoModo: ModoDescuento;
  descuentoValor: number;
  motivoDescuento?: string;
  agregar: (producto: Producto, precio: number) => void;
  setCantidad: (productoId: string, cantidad: number) => void;
  setPrecio: (productoId: string, precio: number) => void;
  setDescuentoLinea: (productoId: string, pct: number | undefined) => void;
  quitar: (productoId: string) => void;
  seleccionar: (productoId: string | null) => void;
  moverSeleccion: (delta: 1 | -1) => void;
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
      seleccionadoId: null,
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
              seleccionadoId: producto.id,
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
            seleccionadoId: producto.id,
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
        set((state) => {
          const idx = state.items.findIndex((i) => i.producto.id === productoId);
          const itemsNew = state.items.filter((i) => i.producto.id !== productoId);
          // Si lo borrado era el seleccionado, pasamos al vecino (mismo
          // índice = el siguiente; si era el último, al anterior).
          let nuevoSel: string | null = state.seleccionadoId;
          if (state.seleccionadoId === productoId) {
            const vecino = itemsNew[idx] ?? itemsNew[idx - 1];
            nuevoSel = vecino?.producto.id ?? null;
          }
          return { items: itemsNew, seleccionadoId: nuevoSel };
        }),
      seleccionar: (productoId) => set({ seleccionadoId: productoId }),
      moverSeleccion: (delta) =>
        set((state) => {
          if (state.items.length === 0) return { seleccionadoId: null };
          const idx = state.items.findIndex((i) => i.producto.id === state.seleccionadoId);
          // Si no hay nada seleccionado: ↓ va al primero, ↑ al último.
          if (idx === -1) {
            return {
              seleccionadoId:
                delta > 0 ? state.items[0]!.producto.id : state.items[state.items.length - 1]!.producto.id,
            };
          }
          const next = Math.max(0, Math.min(state.items.length - 1, idx + delta));
          return { seleccionadoId: state.items[next]!.producto.id };
        }),
      setCliente: (id) => set({ clienteId: id }),
      setDescuento: (modo, valor, motivo) =>
        set({ descuentoModo: modo, descuentoValor: Math.max(0, valor), motivoDescuento: motivo }),
      limpiarDescuento: () => set({ descuentoValor: 0, motivoDescuento: undefined }),
      limpiar: () =>
        set({
          items: [],
          clienteId: null,
          seleccionadoId: null,
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
      // v2: dejamos de persistir descuentoModo/descuentoValor/motivoDescuento.
      // Antes quedaban pegados de una venta a la siguiente: si una cajera
      // aplicaba 2% y vendía, el state cargaba 2% en la próxima venta.
      // El descuento global es per-venta — no debe sobrevivir a recargas.
      version: 2,
      partialize: (s) => ({
        items: s.items,
        clienteId: s.clienteId,
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
