// Tipos de dominio. Estos deben coincidir con el schema Supabase del día 4.
// Si modelamos algo distinto en los mocks, ajustar el SQL antes de aplicar migraciones.

import type { PermisosConfig } from '@comercio/business/permisos';

export type ID = string;
export type ISODate = string;

export type Empresa = {
  id: ID;
  nombre: string;
  cuit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
};

export type Local = {
  id: ID;
  empresa_id: ID;
  nombre: string;
  direccion?: string;
  activo: boolean;
};

export type TipoDeposito = 'central' | 'local' | 'web';

export type Deposito = {
  id: ID;
  empresa_id: ID;
  nombre: string;
  tipo: TipoDeposito;
  local_id?: ID; // si tipo='local', a qué local pertenece
  activo: boolean;
};

export type Caja = {
  id: ID;
  local_id: ID;
  nombre: string;
  activa: boolean;
};

export type Rol = {
  id: ID;
  nombre: string;
  preset: boolean; // si es un rol de sistema (Admin/Encargado/Cajero/Catálogo)
  permisos: PermisosConfig;
};

export type Empleado = {
  id: ID;
  empresa_id: ID;
  nombre: string;
  apellido: string;
  email: string;
  rol_id: ID;
  local_id?: ID;
  deposito_id?: ID;
  permisos_override?: PermisosConfig;
  activo: boolean;
  creado_en: ISODate;
};

export type Categoria = {
  id: ID;
  nombre: string;
  parent_id?: ID;
  // Atributos dinámicos: clave -> tipo (string|number|boolean|enum) — definidos por categoría.
  atributos?: Record<string, { tipo: 'string' | 'number' | 'boolean' | 'enum'; opciones?: string[] }>;
};

export type Proveedor = {
  id: ID;
  nombre: string;
  cuit?: string;
  telefono?: string;
  email?: string;
  contacto?: string;
  activo: boolean;
};

export type EscalaPrecio = {
  desde: number;
  precio: number;
};

export type ListaPrecio = {
  id: ID;
  nombre: string;
  default: boolean;
  activa: boolean;
};

export type ProductoListaPrecio = {
  producto_id: ID;
  lista_precio_id: ID;
  escalas: EscalaPrecio[]; // si solo hay una escala con desde=1, es precio plano
  /** Última vez que se modificó el precio (escalas). Mantenido por
   *  trigger en DB — el cliente no necesita setearlo. Útil para mostrar
   *  "actualizado hace X días" en el detalle del producto. */
  actualizado_en?: string;
};

export type ProductoImagen = {
  id: ID;
  producto_id: ID;
  url: string;
  orden: number;
};

export type Producto = {
  id: ID;
  codigo_interno: string; // 4-5 dígitos, único por empresa
  nombre: string;
  descripcion?: string;
  descripcion_larga?: string;
  categoria_id: ID;
  proveedor_id?: ID;
  costo: number;
  /** Última vez que se modificó el costo. Mantenido por trigger en DB
   *  — el cliente no necesita setearlo. Útil para mostrar "actualizado
   *  hace X días" en el detalle del producto. */
  costo_actualizado_en?: string;
  // Atributos dinámicos según la categoría
  atributos?: Record<string, string | number | boolean>;
  publicado_web: boolean;
  /** Si true, se vende solo por bulto (no admite unidad suelta). Sólo afecta al e-commerce. */
  solo_por_bulto?: boolean;
  /** Cantidad mínima de compra (e-commerce). 0/undefined = sin mínimo. */
  cantidad_minima_web?: number;
  /** Incremento permitido (e-commerce). 1 = unidad, 6 = de a media docena, 12 = de a docena. */
  incremento_web?: number;
  /** Texto libre de promoción/descuento visible para el cajero en el PoS.
   *  Ej. "10% efectivo", "2x1 sábados", "Saldo navideño". Solo informativo
   *  si promo_pct está vacío. Si hay promo_pct > 0, aparece un botón
   *  "Aplicar X%" en el carrito que setea descuento_pct de la línea. */
  promo_texto?: string;
  /** Porcentaje sugerido para la promo (0-100). Si está definido y > 0
   *  Y promo_tipo === 'pct', el cajero puede aplicarlo con un click sobre
   *  la línea del carrito. */
  promo_pct?: number;
  /** Tipo de promo activa:
   *   - undefined/'pct' → usa promo_pct como % de descuento
   *   - 'nxm'           → promo tipo 2x1, 3x2, etc. Usa promo_nxm_lleva/paga.
   *  El PoS decide qué mostrar y cómo aplicar en base a este flag. */
  promo_tipo?: 'pct' | 'nxm';
  /** SOLO cuando promo_tipo === 'nxm'. Cantidad de unidades por "pack".
   *  Ej. 2x1 → lleva=2, paga=1. 3x2 → lleva=3, paga=2. */
  promo_nxm_lleva?: number;
  /** SOLO cuando promo_tipo === 'nxm'. Cantidad de unidades que efectivamente
   *  cobra el cajero por cada pack. Regla: paga < lleva. */
  promo_nxm_paga?: number;
  /** Producto con cuotas sin recargo (ej. valijas, electrodomésticos con
   *  promo del cliente). Cuando true, el modal Cobrar NO aplica el recargo
   *  por cuotas a este ítem — el recargo sigue aplicando al resto del
   *  carrito que no tenga la marca. Se ve un pill "Sin recargo cuotas"
   *  en la línea del PoS. */
  cuotas_sin_recargo?: boolean;
  activo: boolean;
  creado_en: ISODate;
};

export type Variante = {
  id: ID;
  producto_id: ID;
  // Combinación de atributos que define la variante (ej: {color:'rojo', talle:'M'})
  atributos: Record<string, string>;
  codigo_interno?: string; // opcional, override
};

export type StockItem = {
  producto_id: ID;
  variante_id?: ID;
  deposito_id: ID;
  cantidad: number;
  minimo?: number;
};

export type MovimientoStock = {
  id: ID;
  producto_id: ID;
  variante_id?: ID;
  deposito_id: ID;
  tipo: 'venta' | 'devolucion' | 'ajuste' | 'merma' | 'transferencia_salida' | 'transferencia_entrada';
  cantidad: number; // siempre positiva; el tipo determina el signo
  motivo?: string;
  referencia_id?: ID; // venta_id, transferencia_id, etc.
  empleado_id: ID;
  fecha: ISODate;
};

export type Transferencia = {
  id: ID;
  deposito_origen_id: ID;
  deposito_destino_id: ID;
  estado: 'borrador' | 'emitida' | 'recibida' | 'anulada';
  items: { producto_id: ID; variante_id?: ID; cantidad: number }[];
  emitida_por?: ID;
  recibida_por?: ID;
  emitida_en?: ISODate;
  recibida_en?: ISODate;
  creada_en: ISODate;
};

export type Cliente = {
  id: ID;
  nombre: string;
  apellido: string;
  dni?: string;
  cuit?: string;
  direccion?: string;
  codigo_postal?: string;
  telefono?: string;
  email?: string;
  lista_precio_id: ID;
  limite_credito?: number;
  saldo: number; // positivo = nos debe, negativo = saldo a favor
  suspendido: boolean;
  activo: boolean;
  creado_en: ISODate;
};

export type MovimientoCtaCte = {
  id: ID;
  cliente_id: ID;
  tipo: 'cargo' | 'pago' | 'condonacion' | 'ajuste';
  monto: number;
  metodo_pago?: string; // si es un pago
  venta_id?: ID;
  fecha: ISODate;
  empleado_id: ID;
  nota?: string;
};

export type MetodoPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'qr' | 'cta_cte';

export type ItemVenta = {
  producto_id: ID;
  variante_id?: ID;
  cantidad: number;
  precio_unitario: number;
  descuento_pct?: number;
  subtotal: number;
};

export type PagoVenta = {
  metodo: MetodoPago;
  monto: number;
  cuotas?: number; // si crédito
  recargo_pct?: number;
};

export type Venta = {
  id: ID;
  numero: string;
  caja_id: ID;
  sesion_caja_id: ID;
  local_id: ID;
  deposito_id: ID;
  empleado_id: ID;
  cliente_id?: ID; // null = consumidor final sin identificar
  items: ItemVenta[];
  pagos: PagoVenta[];
  subtotal: number;
  descuento_total: number;
  recargo_total: number;
  total: number;
  estado: 'completada' | 'anulada' | 'presupuesto' | 'cancelada';
  anulada_por?: ID;
  anulada_en?: ISODate;
  motivo_anulacion?: string;
  fecha: ISODate;
};

export type NotaCredito = {
  id: ID;
  numero: string;
  venta_id: ID;
  empleado_id: ID;
  motivo: string;
  /** Subset de items de la venta que se devuelven, con cantidad parcial permitida. */
  items: { producto_id: ID; cantidad: number; precio_unitario: number; subtotal: number }[];
  monto_total: number;
  fecha: ISODate;
};

export type SesionCaja = {
  id: ID;
  caja_id: ID;
  /** Empleado que ABRIÓ la caja (histórico, no cambia con "cambiar usuario"). */
  empleado_id: ID;
  /** Empleado responsable AHORA de la caja. Se actualiza cuando se hace
   *  "cambiar usuario" del PoS. Si es null/undefined, usar empleado_id
   *  como fallback (para sesiones viejas anteriores a esta funcionalidad). */
  empleado_actual_id?: ID;
  saldo_inicial: number;
  saldo_final_declarado?: number;
  abierta_en: ISODate;
  cerrada_en?: ISODate;
  estado: 'abierta' | 'cerrada';
};

export type MovimientoCaja = {
  id: ID;
  sesion_caja_id: ID;
  tipo: 'venta' | 'ingreso' | 'egreso' | 'retiro' | 'anulacion';
  metodo: MetodoPago;
  monto: number;
  motivo?: string;
  venta_id?: ID;
  empleado_id: ID;
  fecha: ISODate;
};

export type CuotaRecargo = {
  cuotas: number;
  recargo_pct: number;
};

export type ConfiguracionEmpresa = {
  empresa_id: ID;
  descuento_efectivo_pct: number;
  cuotas: CuotaRecargo[];
  validez_presupuesto_dias: number;
  permitir_venta_sin_stock_default: boolean;
  /** Datos del comercio mostrados en ticket y página de contacto. */
  comercio?: {
    razon_social?: string;
    cuit?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    horario?: string;
    /** URL pública del logo (PNG/SVG). Se muestra en el header del ticket. */
    logo_url?: string;
  };
  /** Monto mínimo de un pedido por el sitio web (en pesos). 0 = sin mínimo. */
  pedido_minimo_web?: number;
  /** Template del mensaje de WhatsApp que se manda desde la web.
   *  Si está vacío, se usa el template por defecto. Soporta variables:
   *  {fecha}, {cliente.razonSocial}, {cliente.contacto}, {cliente.telefono},
   *  {cliente.cuit}, {cliente.email}, {cliente.direccion}, {items}, {total},
   *  {metodoPago}, {entrega}, {notas}. */
  mensaje_wa_template?: string;
  /**
   * "Saldo inicial" del comercio previo al arranque del sistema. Lo carga
   * el admin para no partir los reportes mensuales cuando se arranca con
   * el sistema a mitad de mes (ej. arrancamos el 20 pero queremos que el
   * dashboard de "Este mes" muestre el total real, incluyendo lo facturado
   * antes del 20 fuera del sistema).
   *
   * El dashboard suma estos valores al rango cuando la fecha `desde` del
   * rango es <= `arranque_fecha`. El dueño puede editarlo en cualquier
   * momento desde /admin/configuracion.
   */
  arranque?: {
    /** Monto facturado acumulado previo al sistema (en pesos). */
    facturacion_acumulada?: number;
    /** Cantidad de ventas (tickets) previas al sistema. */
    ventas_acumuladas?: number;
    /** Ganancia bruta acumulada previa al sistema (en pesos). */
    ganancia_acumulada?: number;
    /** Cobrado en efectivo previo al sistema (en pesos). */
    cobrado_efectivo_acumulado?: number;
    /** Cobrado en otros métodos (tarjeta/QR/transf/cta. cte.) previo
     *  al sistema (en pesos). */
    cobrado_otros_acumulado?: number;
    /** Fecha desde la cual cuentan estos acumulados (ISO yyyy-MM-dd).
     *  Si el rango del dashboard empieza igual o antes de esta fecha, se
     *  suman los acumulados; si empieza después, no se suman. */
    desde_fecha?: string;
  };
};

export type LogAuditoria = {
  id: ID;
  empleado_id: ID;
  accion: string; // 'cambio_permisos' | 'creacion_empleado' | etc.
  entidad: string;
  entidad_id?: ID;
  detalle?: Record<string, unknown>;
  fecha: ISODate;
};
