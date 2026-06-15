import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Trash2, AlertTriangle, Tag } from 'lucide-react';
import { getDb } from '@/lib/db';
import { useDepositoActivo } from '@/lib/deposito-activo';
import { useVenta, type ItemCarrito } from '@/stores/venta';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { formatCurrency } from '@comercio/ui/utils';

export function ItemCarritoRow({ item }: { item: ItemCarrito }) {
  const db = getDb();
  const setCantidad = useVenta((s) => s.setCantidad);
  const setPrecio = useVenta((s) => s.setPrecio);
  const setDescuento = useVenta((s) => s.setDescuentoLinea);
  const quitar = useVenta((s) => s.quitar);

  const { depositoId } = useDepositoActivo();
  // Traemos el stock por TODOS los depósitos del producto. Así el cajero ve
  // si hay stock en otro lugar (Central o el otro local) cuando le falta
  // en el suyo, y puede pedir una transferencia.
  const stocksQ = useQuery({
    queryKey: ['stock-prod', item.producto.id],
    queryFn: () => db.stock.porProducto(item.producto.id),
  });
  const depositosQ = useQuery({
    queryKey: ['depositos-pos'],
    queryFn: () => db.depositos.list(),
  });

  const subtotalBruto = item.cantidad * item.precio_unitario;
  const dto = item.descuento_pct ? subtotalBruto * (item.descuento_pct / 100) : 0;
  const subtotal = subtotalBruto - dto;
  const precioEditado = item.precio_unitario !== item.precio_base;
  const stockEnMiDep = Number(
    stocksQ.data?.find((s) => s.deposito_id === depositoId)?.cantidad ?? 0,
  );
  const stockEnOtros = (stocksQ.data ?? [])
    .filter((s) => s.deposito_id !== depositoId && Number(s.cantidad) > 0)
    .map((s) => ({
      cantidad: Number(s.cantidad),
      nombre:
        depositosQ.data?.find((d) => d.id === s.deposito_id)?.nombre ?? 'otro depósito',
    }));
  const stockTrasVenta = stockEnMiDep - item.cantidad;
  const sinStockSuficiente = stockTrasVenta < 0;
  const totalEnOtros = stockEnOtros.reduce((acc, s) => acc + s.cantidad, 0);

  function cambiarDescuento(pct: number) {
    setDescuento(item.producto.id, pct > 0 ? pct : undefined);
  }

  return (
    <tr className="border-b align-top last:border-0">
      <td className="px-3 py-3 font-mono text-xs">{item.producto.codigo_interno}</td>
      <td className="px-3 py-3">
        <div className="font-medium">{item.producto.nombre}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`flex items-center gap-1 ${
              sinStockSuficiente
                ? 'text-destructive'
                : stockTrasVenta <= 2
                  ? 'text-orange-600'
                  : 'text-muted-foreground'
            }`}
          >
            {sinStockSuficiente && <AlertTriangle className="h-3 w-3" />}
            Stock: {stockEnMiDep}
            {item.cantidad > 0 && ` → ${stockTrasVenta} tras venta`}
          </span>
          {/* Desglose de otros depósitos cuando hay stock en otro lugar */}
          {sinStockSuficiente && totalEnOtros > 0 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">
              ⚠ Hay {totalEnOtros} u en otros depósitos:&nbsp;
              {stockEnOtros.map((s, i) => (
                <span key={s.nombre}>
                  {i > 0 ? ' · ' : ''}
                  <b>{s.nombre}</b> ({s.cantidad})
                </span>
              ))}
            </span>
          )}
          {precioEditado && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">
              precio editado · base {formatCurrency(item.precio_base)}
            </span>
          )}
          {item.descuento_pct ? (
            <span className="flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-green-700">
              <Tag className="h-3 w-3" /> -{item.descuento_pct}%
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => setCantidad(item.producto.id, item.cantidad - 1)}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            min="1"
            value={item.cantidad}
            onChange={(e) =>
              setCantidad(item.producto.id, Math.max(1, parseInt(e.target.value) || 1))
            }
            className="h-8 w-14 text-center"
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => setCantidad(item.producto.id, item.cantidad + 1)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={item.precio_unitario}
          onChange={(e) => setPrecio(item.producto.id, parseFloat(e.target.value) || 0)}
          className={`h-8 w-24 text-right ${precioEditado ? 'border-orange-400 bg-orange-50' : ''}`}
        />
      </td>
      <td className="px-3 py-3 text-right">
        <Input
          type="number"
          min="0"
          max="100"
          step="1"
          value={item.descuento_pct ?? ''}
          placeholder="0"
          onChange={(e) => cambiarDescuento(parseFloat(e.target.value) || 0)}
          className="h-8 w-16 text-right"
        />
      </td>
      <td className="px-3 py-3 text-right font-medium tabular-nums">
        {formatCurrency(subtotal)}
      </td>
      <td className="px-3 py-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive"
          onClick={() => quitar(item.producto.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
