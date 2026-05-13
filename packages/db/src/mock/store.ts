import type {
  Caja,
  Categoria,
  Cliente,
  ConfiguracionEmpresa,
  Deposito,
  Empleado,
  Empresa,
  ListaPrecio,
  Local,
  LogAuditoria,
  MovimientoCaja,
  MovimientoCtaCte,
  MovimientoStock,
  Producto,
  ProductoImagen,
  ProductoListaPrecio,
  Proveedor,
  Rol,
  SesionCaja,
  StockItem,
  Transferencia,
  Variante,
  Venta,
} from '../types';

export type Store = {
  empresa: Empresa;
  locales: Local[];
  depositos: Deposito[];
  cajas: Caja[];
  roles: Rol[];
  empleados: Empleado[];
  categorias: Categoria[];
  proveedores: Proveedor[];
  productos: Producto[];
  variantes: Variante[];
  productoImagenes: ProductoImagen[];
  productoListaPrecio: ProductoListaPrecio[];
  listasPrecio: ListaPrecio[];
  stock: StockItem[];
  movimientosStock: MovimientoStock[];
  transferencias: Transferencia[];
  clientes: Cliente[];
  movimientosCtaCte: MovimientoCtaCte[];
  sesionesCaja: SesionCaja[];
  movimientosCaja: MovimientoCaja[];
  ventas: Venta[];
  configuracion: ConfiguracionEmpresa;
  auditoria: LogAuditoria[];
  contadorVentas: number;
  /** Passwords mock (en producción esto vive en Supabase Auth). */
  passwords: Record<string, string>; // empleadoId -> password plano (solo demo)
};
