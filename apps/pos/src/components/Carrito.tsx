import { useVenta } from '@/stores/venta';
import { Button } from '@comercio/ui/button';
import { formatCurrency } from '@comercio/ui/utils';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Input } from '@comercio/ui/input';

export function Carrito() {
  const items = useVenta((s) => s.items);
  const setCantidad = useVenta((s) => s.setCantidad);
  const setPrecio = useVenta((s) => s.setPrecio);
  const quitar = useVenta((s) => s.quitar);

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg">Carrito vacío</p>
          <p className="mt-1 text-sm">Buscá un producto arriba para empezar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 text-left">Código</th>
            <th className="px-3 py-2 text-left">Producto</th>
            <th className="px-3 py-2 text-center">Cantidad</th>
            <th className="px-3 py-2 text-right">Precio unit.</th>
            <th className="px-3 py-2 text-right">Subtotal</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const subtotal = it.cantidad * it.precio_unitario;
            const precioEditado = it.precio_unitario !== it.precio_base;
            return (
              <tr key={it.producto.id} className="border-b last:border-0">
                <td className="px-3 py-3 font-mono text-xs">{it.producto.codigo_interno}</td>
                <td className="px-3 py-3 font-medium">{it.producto.nombre}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => setCantidad(it.producto.id, it.cantidad - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      value={it.cantidad}
                      onChange={(e) =>
                        setCantidad(it.producto.id, Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="h-8 w-14 text-center"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => setCantidad(it.producto.id, it.cantidad + 1)}
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
                    value={it.precio_unitario}
                    onChange={(e) => setPrecio(it.producto.id, parseFloat(e.target.value) || 0)}
                    className={`h-8 w-24 text-right ${precioEditado ? 'border-orange-400 bg-orange-50' : ''}`}
                  />
                </td>
                <td className="px-3 py-3 text-right font-medium">{formatCurrency(subtotal)}</td>
                <td className="px-3 py-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => quitar(it.producto.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
