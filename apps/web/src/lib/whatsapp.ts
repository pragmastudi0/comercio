import type { ItemCarritoWeb } from '@/stores/carrito';
import { precioPorCantidad, totalCarrito } from '@/stores/carrito';
import { SITE } from './config';

export type DatosPedido = {
  razonSocial: string;
  contacto: string;
  telefono: string;
  cuit?: string;
  email?: string;
  direccion?: string;
  metodoPago: 'transferencia' | 'efectivo' | 'cta_cte' | 'a_definir';
  formaEntrega: 'retiro' | 'envio';
  zonaEnvio?: string;
  notas?: string;
};

const LABEL_PAGO: Record<DatosPedido['metodoPago'], string> = {
  transferencia: 'Transferencia bancaria',
  efectivo: 'Efectivo (al retirar)',
  cta_cte: 'Cuenta corriente',
  a_definir: 'A definir',
};

const LABEL_ENTREGA: Record<DatosPedido['formaEntrega'], string> = {
  retiro: 'Retiro en local',
  envio: 'Envío a domicilio',
};

function ars(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Construye el mensaje de WhatsApp completo en texto plano legible. */
export function buildMensaje(items: ItemCarritoWeb[], datos: DatosPedido): string {
  const total = totalCarrito(items);
  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const lineas: string[] = [];
  lineas.push(`*Pedido mayorista — ${SITE.nombre}*`);
  lineas.push(`📅 ${fecha}`);
  lineas.push('');
  lineas.push('*Datos del cliente*');
  lineas.push(`• Razón social: ${datos.razonSocial}`);
  lineas.push(`• Contacto: ${datos.contacto}`);
  lineas.push(`• Teléfono: ${datos.telefono}`);
  if (datos.cuit) lineas.push(`• CUIT: ${datos.cuit}`);
  if (datos.email) lineas.push(`• Email: ${datos.email}`);
  if (datos.direccion) lineas.push(`• Dirección: ${datos.direccion}`);
  lineas.push('');
  lineas.push('*Productos*');
  items.forEach((item, i) => {
    const precio = precioPorCantidad(item.escalas, item.cantidad);
    const sub = precio * item.cantidad;
    lineas.push(
      `${i + 1}. ${item.nombre} (cód ${item.codigo})`,
    );
    lineas.push(`   ${item.cantidad}u × ${ars(precio)} = ${ars(sub)}`);
  });
  lineas.push('');
  lineas.push(`*TOTAL: ${ars(total)}*`);
  lineas.push('');
  lineas.push('*Forma de pago*');
  lineas.push(`• ${LABEL_PAGO[datos.metodoPago]}`);
  lineas.push('');
  lineas.push('*Entrega*');
  lineas.push(`• ${LABEL_ENTREGA[datos.formaEntrega]}`);
  if (datos.formaEntrega === 'envio' && datos.zonaEnvio) {
    lineas.push(`• Zona: ${datos.zonaEnvio}`);
  }
  if (datos.notas?.trim()) {
    lineas.push('');
    lineas.push('*Notas*');
    lineas.push(datos.notas.trim());
  }

  return lineas.join('\n');
}

/** Construye la URL `wa.me` con el mensaje encoded. */
export function buildWhatsappUrl(mensaje: string): string {
  return `https://wa.me/${SITE.whatsappNumero}?text=${encodeURIComponent(mensaje)}`;
}
