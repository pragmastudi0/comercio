import { SITE } from '@/lib/config';

export function Footer() {
  return (
    <footer className="mt-12 border-t bg-muted/30">
      <div className="container mx-auto px-4 py-8 text-sm text-muted-foreground">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <div className="mb-1 font-semibold text-foreground">{SITE.nombre}</div>
            <p>Catálogo mayorista · Pedidos por WhatsApp.</p>
          </div>
          <div>
            <div className="mb-1 font-semibold text-foreground">Contacto</div>
            <p>{SITE.direccion}</p>
            {SITE.email && <p>{SITE.email}</p>}
          </div>
          <div>
            <div className="mb-1 font-semibold text-foreground">Cómo comprar</div>
            <p>Armás el carrito en la web y al finalizar enviás el pedido por WhatsApp.</p>
          </div>
        </div>
        <div className="mt-6 border-t pt-4 text-xs">
          © {new Date().getFullYear()} {SITE.nombre}
        </div>
      </div>
    </footer>
  );
}
