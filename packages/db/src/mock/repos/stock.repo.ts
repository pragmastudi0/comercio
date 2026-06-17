import type { StockRepo } from '../../repos/stock.repo';
import type { MovimientoStock, StockItem } from '../../types';
import type { Store } from '../store';
import { clone, makeId, now } from '../utils';

export function makeStockRepo(store: Store): StockRepo {
  function findOrCreate(productoId: string, depositoId: string, varianteId?: string): StockItem {
    let item = store.stock.find(
      (s) => s.producto_id === productoId && s.deposito_id === depositoId && s.variante_id === varianteId,
    );
    if (!item) {
      item = { producto_id: productoId, deposito_id: depositoId, variante_id: varianteId, cantidad: 0 };
      store.stock.push(item);
    }
    return item;
  }

  return {
    async porProducto(productoId) {
      return clone(store.stock.filter((s) => s.producto_id === productoId));
    },
    async porDeposito(depositoId) {
      return clone(store.stock.filter((s) => s.deposito_id === depositoId));
    },
    async cantidad(productoId, depositoId, varianteId) {
      const item = store.stock.find(
        (s) => s.producto_id === productoId && s.deposito_id === depositoId && s.variante_id === varianteId,
      );
      return item?.cantidad ?? 0;
    },
    async consolidado(filtro = {}) {
      return clone(
        store.stock.filter((s) => {
          if (filtro.producto_id && s.producto_id !== filtro.producto_id) return false;
          if (filtro.deposito_id && s.deposito_id !== filtro.deposito_id) return false;
          if (filtro.sin_stock && s.cantidad > 0) return false;
          return true;
        }),
      );
    },
    async totalesDeMuchos(productoIds, depositoId) {
      const set = new Set(productoIds);
      const map = new Map<string, number>();
      for (const id of productoIds) map.set(id, 0);
      for (const s of store.stock) {
        if (!set.has(s.producto_id)) continue;
        if (depositoId && s.deposito_id !== depositoId) continue;
        map.set(s.producto_id, (map.get(s.producto_id) ?? 0) + s.cantidad);
      }
      return map;
    },
    async ajustar({ producto_id, variante_id, deposito_id, cantidad, motivo, empleado_id }) {
      const item = findOrCreate(producto_id, deposito_id, variante_id);
      item.cantidad += cantidad;
      const mov: MovimientoStock = {
        id: makeId('mov_st'),
        producto_id,
        variante_id,
        deposito_id,
        tipo: 'ajuste',
        cantidad: Math.abs(cantidad),
        motivo,
        empleado_id,
        fecha: now(),
      };
      store.movimientosStock.push(mov);
      return clone(mov);
    },
    async registrarMerma({ producto_id, variante_id, deposito_id, cantidad, motivo, empleado_id }) {
      const item = findOrCreate(producto_id, deposito_id, variante_id);
      item.cantidad -= cantidad;
      const mov: MovimientoStock = {
        id: makeId('mov_st'),
        producto_id,
        variante_id,
        deposito_id,
        tipo: 'merma',
        cantidad,
        motivo,
        empleado_id,
        fecha: now(),
      };
      store.movimientosStock.push(mov);
      return clone(mov);
    },
    async descontarPorVenta({ producto_id, variante_id, deposito_id, cantidad, venta_id, empleado_id, permitirSinStock }) {
      const item = findOrCreate(producto_id, deposito_id, variante_id);
      if (!permitirSinStock && item.cantidad < cantidad) {
        throw new Error(`Stock insuficiente para producto ${producto_id} en depósito ${deposito_id}`);
      }
      item.cantidad -= cantidad;
      const mov: MovimientoStock = {
        id: makeId('mov_st'),
        producto_id,
        variante_id,
        deposito_id,
        tipo: 'venta',
        cantidad,
        referencia_id: venta_id,
        empleado_id,
        fecha: now(),
      };
      store.movimientosStock.push(mov);
      return clone(mov);
    },
    async movimientos(filtro = {}) {
      return clone(
        store.movimientosStock.filter((m) => {
          if (filtro.producto_id && m.producto_id !== filtro.producto_id) return false;
          if (filtro.deposito_id && m.deposito_id !== filtro.deposito_id) return false;
          if (filtro.desde && m.fecha < filtro.desde) return false;
          if (filtro.hasta && m.fecha > filtro.hasta) return false;
          return true;
        }),
      );
    },
  };
}
