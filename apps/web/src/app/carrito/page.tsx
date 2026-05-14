'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  MessageCircle,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  precioPorCantidad,
  subtotalDeItem,
  totalCarrito,
  useCarrito,
} from '@/stores/carrito';
import { buildMensaje, buildWhatsappUrl, type DatosPedido } from '@/lib/whatsapp';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { formatCurrency } from '@comercio/ui/utils';

export default function CarritoPage() {
  const router = useRouter();
  const items = useCarrito((s) => s.items);
  const setCantidad = useCarrito((s) => s.setCantidad);
  const quitar = useCarrito((s) => s.quitar);
  const vaciar = useCarrito((s) => s.vaciar);

  const [datos, setDatos] = useState<DatosPedido>({
    razonSocial: '',
    contacto: '',
    telefono: '',
    cuit: '',
    email: '',
    direccion: '',
    metodoPago: 'transferencia',
    formaEntrega: 'retiro',
    zonaEnvio: '',
    notas: '',
  });

  const total = totalCarrito(items);
  const totalUnidades = items.reduce((acc, i) => acc + i.cantidad, 0);

  function camposValidos(): string | null {
    if (items.length === 0) return 'El carrito está vacío.';
    if (!datos.razonSocial.trim()) return 'Falta la razón social.';
    if (!datos.contacto.trim()) return 'Falta el nombre de contacto.';
    if (!datos.telefono.trim()) return 'Falta el teléfono.';
    if (datos.formaEntrega === 'envio' && !datos.zonaEnvio?.trim()) {
      return 'Si es envío, indicá la zona.';
    }
    return null;
  }

  function enviarWhatsapp() {
    const err = camposValidos();
    if (err) {
      toast.error(err);
      return;
    }
    const mensaje = buildMensaje(items, datos);
    const url = buildWhatsappUrl(mensaje);
    window.open(url, '_blank', 'noopener');
    toast.success('Abriendo WhatsApp…');
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/catalogo">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Volver al catálogo
          </Link>
        </Button>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShoppingBag className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p className="text-lg">Tu carrito está vacío.</p>
            <Button asChild className="mt-4">
              <Link href="/catalogo">Ver catálogo</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/catalogo">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Seguir comprando
        </Link>
      </Button>

      <h1 className="mb-1 text-2xl font-semibold sm:text-3xl">Tu pedido</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Revisá los productos, completá tus datos y enviá el pedido por WhatsApp.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Items */}
        <div className="space-y-3">
          {items.map((item) => {
            const precio = precioPorCantidad(item.escalas, item.cantidad);
            const sub = subtotalDeItem(item);
            const proxima = item.escalas.find((e) => e.desde > item.cantidad);
            return (
              <Card key={item.productoId}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md bg-muted/40">
                    <Package className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-muted-foreground">
                      Cód {item.codigo}
                    </div>
                    <Link
                      href={`/catalogo/${item.productoId}`}
                      className="block font-medium hover:underline"
                    >
                      {item.nombre}
                    </Link>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {formatCurrency(precio)} c/u
                    </div>
                    {proxima && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Llevá {proxima.desde - item.cantidad}u más y baja a{' '}
                        {formatCurrency(proxima.precio)} c/u
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCantidad(item.productoId, item.cantidad - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={item.cantidad}
                        onChange={(e) =>
                          setCantidad(
                            item.productoId,
                            Math.max(1, parseInt(e.target.value) || 1),
                          )
                        }
                        className="h-8 w-16 text-center"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCantidad(item.productoId, item.cantidad + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <div className="ml-auto flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Subtotal</div>
                          <div className="font-semibold tabular-nums">
                            {formatCurrency(sub)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => quitar(item.productoId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                if (confirm('¿Vaciar el carrito?')) {
                  vaciar();
                  toast.info('Carrito vaciado');
                }
              }}
            >
              Vaciar carrito
            </Button>
          </div>
        </div>

        {/* Form de pedido */}
        <div>
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Datos para el pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs">Razón social / Empresa *</Label>
                <Input
                  value={datos.razonSocial}
                  onChange={(e) => setDatos({ ...datos, razonSocial: e.target.value })}
                  placeholder="Mi negocio SA"
                  required
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Contacto *</Label>
                <Input
                  value={datos.contacto}
                  onChange={(e) => setDatos({ ...datos, contacto: e.target.value })}
                  placeholder="Nombre y apellido"
                  required
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Teléfono *</Label>
                <Input
                  value={datos.telefono}
                  onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
                  placeholder="+54 9 351..."
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1 block text-xs">CUIT</Label>
                  <Input
                    value={datos.cuit}
                    onChange={(e) => setDatos({ ...datos, cuit: e.target.value })}
                    placeholder="opcional"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Email</Label>
                  <Input
                    type="email"
                    value={datos.email}
                    onChange={(e) => setDatos({ ...datos, email: e.target.value })}
                    placeholder="opcional"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1 block text-xs">Método de pago preferido</Label>
                <select
                  value={datos.metodoPago}
                  onChange={(e) =>
                    setDatos({ ...datos, metodoPago: e.target.value as DatosPedido['metodoPago'] })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="efectivo">Efectivo (al retirar)</option>
                  <option value="cta_cte">Cuenta corriente</option>
                  <option value="a_definir">A definir</option>
                </select>
              </div>

              <div>
                <Label className="mb-1 block text-xs">Entrega</Label>
                <select
                  value={datos.formaEntrega}
                  onChange={(e) =>
                    setDatos({
                      ...datos,
                      formaEntrega: e.target.value as DatosPedido['formaEntrega'],
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="retiro">Retiro en local</option>
                  <option value="envio">Envío a domicilio</option>
                </select>
              </div>

              {datos.formaEntrega === 'envio' && (
                <div>
                  <Label className="mb-1 block text-xs">Zona / Dirección de envío</Label>
                  <Input
                    value={datos.zonaEnvio}
                    onChange={(e) => setDatos({ ...datos, zonaEnvio: e.target.value })}
                    placeholder="Localidad, calle, número"
                  />
                </div>
              )}

              <div>
                <Label className="mb-1 block text-xs">Notas (opcional)</Label>
                <textarea
                  value={datos.notas}
                  onChange={(e) => setDatos({ ...datos, notas: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Aclaraciones, fecha de retiro, etc."
                />
              </div>

              <div className="border-t pt-3">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Unidades</span>
                  <span>{totalUnidades}</span>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div className="text-xs uppercase text-muted-foreground">Total</div>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatCurrency(total)}
                  </div>
                </div>
              </div>

              <Button className="h-12 w-full text-base" onClick={enviarWhatsapp}>
                <MessageCircle className="mr-2 h-5 w-5" />
                Enviar pedido por WhatsApp
              </Button>
              <p className="text-center text-[10px] text-muted-foreground">
                Se abre WhatsApp con el pedido pre-armado. Confirmamos por ese mismo chat.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
