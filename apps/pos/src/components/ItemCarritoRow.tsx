import { useEffect, useState } from 'react';
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
  const setMotivoPrecio = useVenta((s) => s.setMotivoPrecio);
  const setDescuento = useVenta((s) => s.setDescuentoLinea);
  const setMotivoDescuentoLinea = useVenta((s) => s.setMotivoDescuentoLinea);
  const quitar = useVenta((s) => s.quitar);
  const seleccionar = useVenta((s) => s.seleccionar);
  const seleccionado = useVenta((s) => s.seleccionadoId === item.producto.id);

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

  // Input de precio: buffer local de string para que el cajero pueda
  // borrar todo el campo y tipear el nuevo sin que React fuerce un "0".
  // Sincroniza al store en onBlur (o al apretar Enter).
  const [precioTxt, setPrecioTxt] = useState<string>(String(item.precio_unitario));
  useEffect(() => {
    setPrecioTxt(String(item.precio_unitario));
  }, [item.precio_unitario]);
  function commitPrecio() {
    const v = precioTxt.replace(',', '.').trim();
    if (v === '') {
      setPrecio(item.producto.id, item.precio_base);
      return;
    }
    const n = parseFloat(v);
    if (isFinite(n) && n >= 0) setPrecio(item.producto.id, n);
    else setPrecioTxt(String(item.precio_unitario));
  }
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

  // Si hubo cambio de precio o descuento por línea, mostramos una
  // sub-fila debajo con un input de motivo (obligatorio al cobrar).
  // Queda guardado en auditoría y se ve después en el detalle de la venta.
  const requiereMotivoPrecio = item.precio_unitario !== item.precio_base;
  const requiereMotivoDescuento = !!item.descuento_pct && item.descuento_pct > 0;
  const mostrarMotivos = requiereMotivoPrecio || requiereMotivoDescuento;

  return (
    <>
    <tr
      onClick={() => seleccionar(item.producto.id)}
      className={`cursor-pointer ${mostrarMotivos ? '' : 'border-b'} align-top last:border-0 ${
        seleccionado ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/40'
      }`}
    >
      <td className="px-3 py-3 font-mono text-xs">{item.producto.codigo_interno}</td>
      <td className="px-3 py-3">
        <div className="font-medium">{item.producto.nombre}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
          {/* Política Turisteando: el cajero NO debe ver cantidades de
              stock — sólo el aviso cualitativo de que hay en otro local
              cuando no alcanza acá. La venta nunca se bloquea por stock. */}
          {sinStockSuficiente && totalEnOtros > 0 && (
            <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
              <AlertTriangle className="h-3 w-3" />
              Hay en{' '}
              {stockEnOtros.map((s, i) => (
                <span key={s.nombre}>
                  {i > 0 ? ' / ' : ''}
                  <b>{s.nombre}</b>
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
          type="text"
          inputMode="decimal"
          value={precioTxt}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setPrecioTxt(e.target.value)}
          onBlur={commitPrecio}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitPrecio();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setPrecioTxt(String(item.precio_unitario));
              (e.target as HTMLInputElement).blur();
            }
          }}
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

    {/* Sub-fila con motivos: solo aparece si el cajero editó precio o
        aplicó descuento en esta línea. Sin motivo, el cobro se bloquea
        con un toast claro y el motivo queda en auditoría. */}
    {mostrarMotivos && (
      <tr
        className={`border-b align-top last:border-0 ${
          seleccionado ? 'bg-primary/10' : 'bg-muted/20'
        }`}
        onClick={() => seleccionar(item.producto.id)}
      >
        <td colSpan={7} className="px-3 pb-2 pt-0">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {requiereMotivoPrecio && (
              <div className="flex flex-1 items-center gap-1.5 rounded border border-orange-300 bg-orange-50/60 px-2 py-1">
                <span className="font-medium text-orange-800 whitespace-nowrap">
                  Motivo cambio de precio:
                </span>
                <Input
                  type="text"
                  value={item.motivo_precio ?? ''}
                  onChange={(e) => setMotivoPrecio(item.producto.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Ej: promo, cliente conocido, daño en la unidad"
                  className="h-6 flex-1 border-orange-300 bg-white text-xs"
                />
              </div>
            )}
            {requiereMotivoDescuento && (
              <div className="flex flex-1 items-center gap-1.5 rounded border border-green-300 bg-green-50/60 px-2 py-1">
                <span className="font-medium text-green-800 whitespace-nowrap">
                  Motivo descuento {item.descuento_pct}%:
                </span>
                <Input
                  type="text"
                  value={item.motivo_descuento_linea ?? ''}
                  onChange={(e) => setMotivoDescuentoLinea(item.producto.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Ej: cliente frecuente, error de marcado"
                  className="h-6 flex-1 border-green-300 bg-white text-xs"
                />
              </div>
            )}
          </div>
        </td>
      </tr>
    )}
    </>
  );
}
