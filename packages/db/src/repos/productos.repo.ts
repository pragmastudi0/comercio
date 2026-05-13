import type { ID, Producto, ProductoImagen, ProductoListaPrecio, Variante } from '../types';

export type FiltroProductos = {
  texto?: string; // busca en código y nombre
  categoria_id?: ID;
  proveedor_id?: ID;
  sin_stock?: boolean;
  publicado_web?: boolean;
  activo?: boolean;
};

export type ProductosRepo = {
  list(filtro?: FiltroProductos): Promise<Producto[]>;
  buscarRapido(query: string, limit?: number): Promise<Producto[]>;
  buscarPorCodigo(codigo: string): Promise<Producto | null>;
  get(id: ID): Promise<Producto | null>;
  create(input: Omit<Producto, 'id' | 'creado_en'>): Promise<Producto>;
  update(id: ID, patch: Partial<Producto>): Promise<Producto>;
  delete(id: ID): Promise<void>;
  aumentoMasivo(filtro: FiltroProductos, porcentaje: number, listaPrecioId: ID): Promise<number>;

  // Variantes
  variantes(productoId: ID): Promise<Variante[]>;
  crearVariante(productoId: ID, atributos: Record<string, string>): Promise<Variante>;
  eliminarVariante(varianteId: ID): Promise<void>;

  // Imágenes
  imagenes(productoId: ID): Promise<ProductoImagen[]>;
  agregarImagen(productoId: ID, url: string): Promise<ProductoImagen>;
  eliminarImagen(imagenId: ID): Promise<void>;
  reordenarImagenes(productoId: ID, idsEnOrden: ID[]): Promise<void>;

  // Listas de precio
  preciosDe(productoId: ID): Promise<ProductoListaPrecio[]>;
  setPrecio(productoId: ID, listaPrecioId: ID, escalas: { desde: number; precio: number }[]): Promise<void>;
};
