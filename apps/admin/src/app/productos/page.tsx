'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Minus,
  Search,
  Save,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Package,
  LineChart,
} from 'lucide-react';
import { ModalEstadisticasProducto } from '@/components/modal-estadisticas-producto';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { PRESET_IDS, type Producto } from '@comercio/db';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';
import { RequierePermiso, usePermiso } from '@/lib/permisos';

const PAGE_SIZE = 50;
const UMBRAL_BAJO_STOCK = 5;

type FiltroStock = '' | 'sin' | 'bajo';

/**
 * Página de Productos rediseñada estilo "Edición de artículos" del
 * sistema viejo: tabla a la izquierda con buscador + filtros, panel
 * detalle del producto seleccionado a la derecha. Todo en una sola
 * vista — sin tener que navegar a /productos/{id} para editar.
 *
 * La ruta /productos/{id} sigue funcionando para deep-links pero el
 * flujo principal del dueño es desde acá.
 */
function ProductosPageInner() {
  const db = getDb();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [texto, setTexto] = useState('');
  const stockInicial = (params.get('stock') ?? '') as FiltroStock;
  const [filtroStock, setFiltroStock] = useState<FiltroStock>(
    stockInicial === 'sin' || stockInicial === 'bajo' ? stockInicial : '',
  );
  const [categoriaId, setCategoriaId] = useState(params.get('categoria') ?? '');
  const [proveedorId, setProveedorId] = useState(params.get('proveedor') ?? '');
  const [page, setPage] = useState(0);

  // Producto seleccionado (de la tabla izquierda) que se muestra en el panel.
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  // Modo "crear nuevo" — el panel derecho se transforma en un form vacío
  // para crear inline. Tiene prioridad sobre seleccionadoId. Se puede
  // pre-activar entrando con ?nuevo=1 (lo usa el botón "Productos" de
  // la toolbar del shell).
  const [modoCrear, setModoCrear] = useState(params.get('nuevo') === '1');

  useEffect(() => {
    setPage(0);
  }, [texto, categoriaId, proveedorId, filtroStock]);

  // Sincronizar state local con los query params. Necesario porque Next.js
  // mantiene el componente montado al navegar entre /productos?nuevo=1 y
  // /productos?stock=bajo — los useState con valor inicial leído de params
  // solo corren una vez al mount. Sin esto, click en "Faltantes" desde la
  // vista de "Productos" no actualizaba el filtro.
  useEffect(() => {
    const stockParam = params.get('stock') ?? '';
    setFiltroStock(
      stockParam === 'sin' || stockParam === 'bajo' ? stockParam : '',
    );
    setModoCrear(params.get('nuevo') === '1');
    setCategoriaId(params.get('categoria') ?? '');
    setProveedorId(params.get('proveedor') ?? '');
  }, [params]);

  const productosQ = useQuery({
    queryKey: ['productos-admin', texto, categoriaId, proveedorId, filtroStock, page],
    queryFn: () =>
      db.productos.listPaginado({
        page,
        pageSize: PAGE_SIZE,
        texto: texto || undefined,
        categoria_id: categoriaId || undefined,
        proveedor_id: proveedorId || undefined,
        sin_stock: filtroStock === 'sin' || undefined,
        bajo_stock: filtroStock === 'bajo' || undefined,
        umbral_bajo_stock: filtroStock === 'bajo' ? UMBRAL_BAJO_STOCK : undefined,
        activo: true,
      }),
    placeholderData: (prev) => prev,
  });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const proveedoresQ = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => db.proveedores.list(),
  });

  const total = productosQ.data?.total ?? 0;
  const rows = productosQ.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const puedeEditar = usePermiso('productos', 'editar');

  // Precios CF y stock total para los productos visibles.
  const LISTA_CF_IDS = useMemo(() => [PRESET_IDS.listas.consumidorFinal, 'lp_cf'], []);
  const idsVisibles = rows.map((p) => p.id).join(',');
  const preciosQ = useQuery({
    queryKey: ['precios-cf-page', idsVisibles],
    queryFn: async () => {
      const map = new Map<string, number>();
      for (const p of rows) {
        const lp = await db.productos.preciosDe(p.id);
        const cf = lp.find((x) => LISTA_CF_IDS.includes(x.lista_precio_id));
        map.set(p.id, cf?.escalas[0]?.precio ?? 0);
      }
      return map;
    },
    enabled: rows.length > 0,
  });
  const stockQ = useQuery({
    queryKey: ['stock-totales-page', idsVisibles],
    queryFn: () => db.stock.totalesDeMuchos(rows.map((p) => p.id)),
    enabled: rows.length > 0,
    staleTime: 15_000,
  });

  // Auto-seleccionar el primer producto cuando carga la lista la primera vez.
  useEffect(() => {
    if (!seleccionadoId && rows.length > 0) {
      setSeleccionadoId(rows[0]!.id);
    }
  }, [rows, seleccionadoId]);

  const categoriaNombre = (id: string) =>
    categoriasQ.data?.find((c) => c.id === id)?.nombre ?? '—';

  return (
    <div className="flex h-[calc(100vh-180px)] flex-col gap-2 px-3 py-2 lg:flex-row">
      {/* IZQUIERDA: tabla + filtros */}
      <div className="flex min-h-0 flex-1 flex-col rounded border border-slate-300 bg-white shadow-sm lg:max-w-[60%]">
        {/* Botón "+ Nuevo producto" arriba */}
        <RequierePermiso modulo="productos" accion="crear">
          <div className="border-b border-slate-200 bg-white px-2 py-1.5">
            <Button
              size="sm"
              onClick={() => {
                setModoCrear(true);
                setSeleccionadoId(null);
              }}
              className="h-7 text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Agregar producto nuevo
            </Button>
          </div>
        </RequierePermiso>

        {/* Filtros compactos arriba */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 p-2 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-2">
            <Label className="mb-0.5 block text-[10px] uppercase text-slate-600">
              Filtrar por nombre
            </Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Código o nombre del producto"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="h-8 pl-7 text-sm"
                autoFocus
              />
            </div>
          </div>
          <div>
            <Label className="mb-0.5 block text-[10px] uppercase text-slate-600">
              Filtrar por grupo
            </Label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="h-8 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">(Mostrar todos)</option>
              {(categoriasQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-0.5 block text-[10px] uppercase text-slate-600">
              Filtrar por proveedor
            </Label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="h-8 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">(Mostrar todos)</option>
              {(proveedoresQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla */}
        <div className="min-h-0 flex-1 overflow-auto">
          {productosQ.isLoading && rows.length === 0 ? (
            <div className="p-3">
              <Skeleton className="h-40" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No se encontraron productos con esos filtros.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase text-slate-600 shadow-sm">
                <tr>
                  <th className="border-b border-r border-slate-300 px-2 py-1.5 text-left">
                    Artículo
                  </th>
                  <th className="border-b border-r border-slate-300 px-2 py-1.5 text-left">
                    Código
                  </th>
                  <th className="border-b border-r border-slate-300 px-2 py-1.5 text-left">
                    Grupo
                  </th>
                  <th className="border-b border-r border-slate-300 px-2 py-1.5 text-left">
                    Proveedor
                  </th>
                  <th className="border-b border-slate-300 px-2 py-1.5 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const stock = stockQ.data?.get(p.id) ?? 0;
                  const sinStockProd = stock <= 0;
                  const seleccionado = p.id === seleccionadoId;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        setSeleccionadoId(p.id);
                        setModoCrear(false);
                      }}
                      className={`cursor-pointer border-b border-slate-200 ${
                        seleccionado && !modoCrear
                          ? 'bg-blue-100 font-medium'
                          : 'hover:bg-blue-50/50'
                      }`}
                    >
                      <td className="border-r border-slate-200 px-2 py-1">{p.nombre}</td>
                      <td className="border-r border-slate-200 px-2 py-1 font-mono">
                        {p.codigo_interno}
                      </td>
                      <td className="border-r border-slate-200 px-2 py-1 text-slate-600">
                        {categoriaNombre(p.categoria_id)}
                      </td>
                      <td className="border-r border-slate-200 px-2 py-1 text-slate-600">
                        {proveedoresQ.data?.find((x) => x.id === p.proveedor_id)?.nombre ?? '—'}
                      </td>
                      <td
                        className={`px-2 py-1 text-right tabular-nums ${
                          sinStockProd ? 'font-semibold text-red-600' : ''
                        }`}
                      >
                        {stockQ.data ? stock : '…'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación + filtros adicionales en footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <select
              value={filtroStock}
              onChange={(e) => setFiltroStock(e.target.value as FiltroStock)}
              className="h-7 rounded-sm border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="">Stock: todos</option>
              <option value="sin">Sin stock</option>
              <option value="bajo">Bajo stock (≤ {UMBRAL_BAJO_STOCK})</option>
            </select>
            <span className="text-slate-600">
              {total === 0
                ? '0 productos'
                : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total}`}
            </span>
          </div>
          {total > PAGE_SIZE && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || productosQ.isFetching}
                className="rounded-sm border border-slate-300 bg-white px-2 py-0.5 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-slate-600">
                {page + 1}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || productosQ.isFetching}
                className="rounded-sm border border-slate-300 bg-white px-2 py-0.5 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* DERECHA: panel detalle del producto seleccionado */}
      <div className="flex min-h-0 flex-1 flex-col rounded border border-slate-300 bg-white shadow-sm lg:max-w-[40%]">
        {modoCrear ? (
          <PanelNuevoProducto
            onCreated={(nuevoId) => {
              setModoCrear(false);
              setSeleccionadoId(nuevoId);
            }}
            onCancel={() => setModoCrear(false)}
          />
        ) : seleccionadoId ? (
          <PanelProducto
            key={seleccionadoId}
            productoId={seleccionadoId}
            onDeleted={() => setSeleccionadoId(null)}
            puedeEditar={puedeEditar}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
            <div>
              <Package className="mx-auto mb-2 h-8 w-8 opacity-30" />
              Seleccioná un producto a la izquierda para ver/editar su detalle.
              <div className="mt-3">
                <RequierePermiso modulo="productos" accion="crear">
                  <Button size="sm" onClick={() => setModoCrear(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Agregar producto nuevo
                  </Button>
                </RequierePermiso>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Panel detalle del producto seleccionado. Form inline con costo / precio
 * CF / margen calculado / stock por local. Botón Guardar persiste todos
 * los cambios (producto + precio CF) en paralelo.
 */
function PanelProducto({
  productoId,
  onDeleted,
  puedeEditar,
}: {
  productoId: string;
  onDeleted: () => void;
  puedeEditar: boolean;
}) {
  const db = getDb();
  const qc = useQueryClient();
  const productoQ = useQuery({
    queryKey: ['producto-detalle', productoId],
    queryFn: () => db.productos.get(productoId),
  });
  const preciosQ = useQuery({
    queryKey: ['producto-precios-detalle', productoId],
    queryFn: () => db.productos.preciosDe(productoId),
  });
  const depositosQ = useQuery({
    queryKey: ['depositos'],
    queryFn: () => db.depositos.list(),
  });
  const stockQ = useQuery({
    queryKey: ['producto-stock-detalle', productoId],
    queryFn: () => db.stock.porProducto(productoId),
  });
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const proveedoresQ = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => db.proveedores.list(),
  });

  const LISTA_CF_ID = PRESET_IDS.listas.consumidorFinal;
  const precioCfInicial =
    preciosQ.data
      ?.find((x) => x.lista_precio_id === LISTA_CF_ID)
      ?.escalas[0]?.precio ?? 0;

  // State local del form. Se inicializa cuando carga el producto.
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  // Modal de estadísticas (última venta, rotación, totales).
  const [estadOpen, setEstadOpen] = useState(false);
  const [costoTxt, setCostoTxt] = useState('');
  const [precioCfTxt, setPrecioCfTxt] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    if (productoQ.data) {
      setNombre(productoQ.data.nombre);
      setCodigo(productoQ.data.codigo_interno);
      setCostoTxt(String(productoQ.data.costo ?? 0));
      setCategoriaId(productoQ.data.categoria_id ?? '');
      setProveedorId(productoQ.data.proveedor_id ?? '');
      setActivo(productoQ.data.activo ?? true);
    }
  }, [productoQ.data]);

  useEffect(() => {
    if (preciosQ.data) {
      setPrecioCfTxt(String(precioCfInicial));
    }
  }, [preciosQ.data, precioCfInicial]);

  const costo = parseFloat(costoTxt) || 0;
  const precioCf = parseFloat(precioCfTxt) || 0;
  const margen = costo > 0 ? ((precioCf - costo) / costo) * 100 : 0;

  function setMargenAmano(nuevoMargen: number) {
    if (costo <= 0) return;
    const nuevoPrecio = costo * (1 + nuevoMargen / 100);
    setPrecioCfTxt(String(Number(nuevoPrecio.toFixed(2))));
  }

  const guardarMut = useMutation({
    mutationFn: async () => {
      if (!productoQ.data) throw new Error('Producto no cargado');
      // Update del producto (campos básicos).
      const patch: Partial<Producto> = {
        nombre,
        codigo_interno: codigo,
        costo,
        categoria_id: categoriaId || undefined,
        proveedor_id: proveedorId || undefined,
        activo,
      };
      await db.productos.update(productoId, patch);
      // Update del precio CF si cambió.
      if (precioCf !== precioCfInicial) {
        await db.productos.setPrecio(productoId, LISTA_CF_ID, [
          { desde: 1, precio: precioCf },
        ]);
      }
    },
    onSuccess: () => {
      toast.success('Producto actualizado');
      qc.invalidateQueries({ queryKey: ['productos-admin'] });
      qc.invalidateQueries({ queryKey: ['producto-detalle', productoId] });
      qc.invalidateQueries({ queryKey: ['producto-precios-detalle', productoId] });
      qc.invalidateQueries({ queryKey: ['precios-cf-page'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminarMut = useMutation({
    mutationFn: () => db.productos.delete(productoId),
    onSuccess: () => {
      toast.success('Producto eliminado');
      qc.invalidateQueries({ queryKey: ['productos-admin'] });
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalStock = (stockQ.data ?? []).reduce(
    (acc, s) => acc + Number(s.cantidad),
    0,
  );

  if (productoQ.isLoading || !productoQ.data) {
    return <Skeleton className="m-3 h-full" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2">
      {/* Encabezado del panel: disponible para vender + estadísticas + código */}
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <label
          className="flex items-center gap-1.5 text-xs"
          title="Si está desmarcado, el cajero NO encuentra el producto en el PoS. Sirve para retirar de la venta un producto sin borrarlo (ej. discontinuado pero quedó stock)."
        >
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            disabled={!puedeEditar}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          <span className="font-medium text-slate-700">Disponible para vender</span>
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEstadOpen(true)}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            title="Ver última venta, rotación y totales del producto"
          >
            <LineChart className="h-3 w-3" />
            Estadísticas
          </button>
          <span className="font-mono text-xs text-slate-500">#{productoQ.data.codigo_interno}</span>
        </div>
      </div>

      {/* Campos editables */}
      <div className="space-y-1.5">
        <div>
          <Label className="mb-0 block text-[10px] uppercase text-slate-600">Nombre</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={!puedeEditar}
            className="h-7 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">
              Código
            </Label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              disabled={!puedeEditar}
              maxLength={5}
              className="h-7 text-sm tabular-nums"
            />
          </div>
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">
              Costo
            </Label>
            <Input
              type="number"
              step="0.01"
              value={costoTxt}
              onChange={(e) => setCostoTxt(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              disabled={!puedeEditar}
              className="h-7 text-sm tabular-nums"
            />
          </div>
        </div>

        {/* Precio CF + Margen lado a lado, sincronizados */}
        <div className="rounded border border-blue-200 bg-blue-50/50 p-1.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-0 block text-[10px] uppercase text-slate-700">
                Precio público
              </Label>
              <Input
                type="number"
                step="0.01"
                value={precioCfTxt}
                onChange={(e) => setPrecioCfTxt(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                disabled={!puedeEditar}
                className="h-7 text-sm font-semibold tabular-nums"
              />
            </div>
            <div>
              <Label className="mb-0 block text-[10px] uppercase text-slate-700">
                Margen %
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.1"
                  value={costo > 0 ? Number(margen.toFixed(2)) : ''}
                  onChange={(e) => setMargenAmano(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.currentTarget.select()}
                  disabled={!puedeEditar || costo <= 0}
                  placeholder={costo <= 0 ? 'sin costo' : ''}
                  className="h-7 pr-6 text-sm font-semibold tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  %
                </span>
              </div>
            </div>
          </div>
          {costo > 0 && precioCf > 0 && (
            <div className="mt-0.5 text-[10px] text-slate-600">
              Ganás <b>{formatCurrency(precioCf - costo)}</b> por unidad.
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">Categoría</Label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              disabled={!puedeEditar}
              className="h-7 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">— Ninguna —</option>
              {(categoriasQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">Proveedor</Label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              disabled={!puedeEditar}
              className="h-7 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">— Ninguno —</option>
              {(proveedoresQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stock por local con cargar inline (+/-)  */}
        <StockPorLocal
          productoId={productoId}
          depositos={depositosQ.data ?? []}
          stocks={stockQ.data ?? []}
          totalStock={totalStock}
          puedeEditar={puedeEditar}
        />
      </div>

      {/* Footer: botones de acción */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
        {puedeEditar && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(`¿Eliminar "${productoQ.data!.nombre}"?`)) {
                eliminarMut.mutate();
              }
            }}
            disabled={eliminarMut.isPending}
            className="text-red-700 hover:bg-red-50"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Eliminar
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => guardarMut.mutate()}
          disabled={!puedeEditar || guardarMut.isPending}
          className="ml-auto"
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {guardarMut.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>

      <ModalEstadisticasProducto
        open={estadOpen}
        onOpenChange={setEstadOpen}
        productoId={productoId}
        productoNombre={productoQ.data.nombre}
        productoCodigo={productoQ.data.codigo_interno}
      />
    </div>
  );
}

/**
 * Stock por local con la posibilidad de cargar/descontar unidades inline.
 * Cada local tiene su input de delta y un botón "+" para sumar (o "-" si
 * el delta es negativo). Es la forma rápida que pidió Agus para ajustar
 * stock sin abrir un modal aparte.
 */
function StockPorLocal({
  productoId,
  depositos,
  stocks,
  totalStock,
  puedeEditar,
}: {
  productoId: string;
  depositos: { id: string; nombre: string }[];
  stocks: { deposito_id: string; cantidad: number | string }[];
  totalStock: number;
  puedeEditar: boolean;
}) {
  const db = getDb();
  const qc = useQueryClient();
  const empleado = useSesion((s) => s.empleado);
  // Delta por local (string para que se pueda dejar vacío sin convertir a 0).
  const [deltas, setDeltas] = useState<Record<string, string>>({});

  const ajustarMut = useMutation({
    mutationFn: async ({ depositoId, delta }: { depositoId: string; delta: number }) => {
      if (!empleado) throw new Error('Sin sesión');
      if (!Number.isFinite(delta) || delta === 0) throw new Error('Cantidad inválida');
      await db.stock.ajustar({
        producto_id: productoId,
        deposito_id: depositoId,
        cantidad: delta,
        motivo: 'Ajuste rápido desde detalle de producto',
        empleado_id: empleado.id,
      });
    },
    onSuccess: async (_data, vars) => {
      const signo = vars.delta > 0 ? '+' : '';
      toast.success(`Stock ajustado ${signo}${vars.delta}`);
      setDeltas((prev) => ({ ...prev, [vars.depositoId]: '' }));
      // refetch (no solo invalidate) para que el panel muestre el nuevo
      // valor sin esperar a que React vuelva a observar la query.
      await Promise.all([
        qc.refetchQueries({ queryKey: ['producto-stock-detalle', productoId] }),
        qc.refetchQueries({ queryKey: ['stock-totales-page'] }),
        qc.refetchQueries({ queryKey: ['stock-consolidado'] }),
      ]);
    },
    onError: (e: Error) => {
      // eslint-disable-next-line no-console
      console.error('Ajuste de stock falló:', e);
      toast.error(`No se pudo guardar: ${e.message}`);
    },
  });

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-1.5">
      <div className="mb-1 flex items-center justify-between">
        <Label className="block text-[10px] uppercase text-slate-600">
          Stock por local
        </Label>
        <span className="text-[10px] text-slate-500">+ suma · - resta</span>
      </div>
      <div className="space-y-1">
        {depositos.map((d) => {
          const cant = Number(
            stocks.find((s) => s.deposito_id === d.id)?.cantidad ?? 0,
          );
          const delta = deltas[d.id] ?? '';
          const deltaN = parseFloat(delta);
          const tieneDelta = !isNaN(deltaN) && deltaN !== 0;
          return (
            <div
              key={d.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-600">{d.nombre}</span>
                <span
                  className={`font-semibold tabular-nums ${
                    cant <= 0 ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {cant}
                </span>
              </div>
              {puedeEditar && (
                <>
                  <Input
                    type="number"
                    step="1"
                    value={delta}
                    onChange={(e) =>
                      setDeltas((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tieneDelta) {
                        e.preventDefault();
                        ajustarMut.mutate({ depositoId: d.id, delta: deltaN });
                      }
                    }}
                    className="h-6 w-14 text-right text-xs tabular-nums"
                    disabled={ajustarMut.isPending}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      tieneDelta &&
                      ajustarMut.mutate({ depositoId: d.id, delta: deltaN })
                    }
                    disabled={!tieneDelta || ajustarMut.isPending}
                    className="flex h-6 w-6 items-center justify-center rounded-sm border border-slate-300 bg-white hover:bg-emerald-50 disabled:opacity-40"
                    title={
                      tieneDelta
                        ? `${deltaN > 0 ? 'Sumar' : 'Restar'} ${Math.abs(deltaN)}`
                        : 'Tipear cantidad'
                    }
                  >
                    {deltaN < 0 ? (
                      <Minus className="h-3 w-3 text-red-600" />
                    ) : (
                      <Plus className="h-3 w-3 text-emerald-700" />
                    )}
                  </button>
                </>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between rounded-sm border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs">
          <span className="font-semibold text-blue-800">Total</span>
          <span className="font-bold tabular-nums text-blue-800">{totalStock}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Form de "crear producto nuevo" embebido en el panel derecho.
 * Versión simplificada: solo campos básicos + stock inicial. Si hace
 * falta lo del e-commerce (publicación web, descripción larga, etc.)
 * el botón "Más opciones" lleva a la página completa /productos/nuevo.
 */
function PanelNuevoProducto({
  onCreated,
  onCancel,
}: {
  onCreated: (nuevoId: string) => void;
  onCancel: () => void;
}) {
  const db = getDb();
  const qc = useQueryClient();
  const empleado = useSesion((s) => s.empleado);

  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [costoTxt, setCostoTxt] = useState('');
  const [precioCfTxt, setPrecioCfTxt] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [activo, setActivo] = useState(true);
  const [stockInicial, setStockInicial] = useState<Record<string, string>>({});

  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const proveedoresQ = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => db.proveedores.list({ activo: true }),
  });
  const depositosQ = useQuery({
    queryKey: ['depositos'],
    queryFn: () => db.depositos.list(),
  });

  const costo = parseFloat(costoTxt) || 0;
  const precioCf = parseFloat(precioCfTxt) || 0;
  const margen = costo > 0 ? ((precioCf - costo) / costo) * 100 : 0;
  function setMargenAmano(nuevoMargen: number) {
    if (costo <= 0) return;
    setPrecioCfTxt(String(Number((costo * (1 + nuevoMargen / 100)).toFixed(2))));
  }

  const LISTA_CF_ID = PRESET_IDS.listas.consumidorFinal;

  const crearMut = useMutation({
    mutationFn: async () => {
      if (!codigo.trim() || !nombre.trim() || !categoriaId) {
        throw new Error('Código, nombre y categoría son obligatorios');
      }
      if (!empleado) throw new Error('Sin sesión');
      const existente = await db.productos.buscarPorCodigo(codigo.trim());
      if (existente) throw new Error(`El código ${codigo.trim()} ya existe`);
      const p = await db.productos.create({
        codigo_interno: codigo.trim(),
        nombre: nombre.trim(),
        categoria_id: categoriaId,
        proveedor_id: proveedorId || undefined,
        costo,
        publicado_web: false,
        activo,
      });
      if (precioCf > 0) {
        await db.productos.setPrecio(p.id, LISTA_CF_ID, [{ desde: 1, precio: precioCf }]);
      }
      for (const d of depositosQ.data ?? []) {
        const cant = parseFloat(stockInicial[d.id] ?? '0');
        if (Number.isFinite(cant) && cant > 0) {
          await db.stock.ajustar({
            producto_id: p.id,
            deposito_id: d.id,
            cantidad: cant,
            motivo: 'Stock inicial al crear producto',
            empleado_id: empleado.id,
          });
        }
      }
      return p.id;
    },
    onSuccess: (id) => {
      toast.success('Producto creado');
      qc.invalidateQueries({ queryKey: ['productos-admin'] });
      onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2">
      <div className="mb-1.5 flex items-center justify-between border-b border-slate-200 pb-1.5">
        <label
          className="flex items-center gap-1.5 text-xs"
          title="Si está desmarcado, el cajero NO encuentra el producto en el PoS."
        >
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          <span className="font-medium text-slate-700">Disponible para vender</span>
        </label>
        <span className="text-xs font-semibold text-emerald-700">NUEVO</span>
      </div>

      <div className="space-y-1.5">
        <div>
          <Label className="mb-0 block text-[10px] uppercase text-slate-600">
            Nombre <span className="text-red-600">*</span>
          </Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            placeholder="Nombre del producto"
            className="h-7 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">
              Código <span className="text-red-600">*</span>
            </Label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              maxLength={5}
              placeholder="1234"
              className="h-7 text-sm tabular-nums"
            />
          </div>
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">Costo</Label>
            <Input
              type="number"
              step="0.01"
              value={costoTxt}
              onChange={(e) => setCostoTxt(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="h-7 text-sm tabular-nums"
            />
          </div>
        </div>

        <div className="rounded border border-blue-200 bg-blue-50/50 p-1.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-0 block text-[10px] uppercase text-slate-700">
                Precio público
              </Label>
              <Input
                type="number"
                step="0.01"
                value={precioCfTxt}
                onChange={(e) => setPrecioCfTxt(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="h-7 text-sm font-semibold tabular-nums"
              />
            </div>
            <div>
              <Label className="mb-0 block text-[10px] uppercase text-slate-700">Margen %</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.1"
                  value={costo > 0 ? Number(margen.toFixed(2)) : ''}
                  onChange={(e) => setMargenAmano(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.currentTarget.select()}
                  disabled={costo <= 0}
                  placeholder={costo <= 0 ? 'sin costo' : ''}
                  className="h-7 pr-6 text-sm font-semibold tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  %
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">
              Categoría <span className="text-red-600">*</span>
            </Label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="h-7 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">— Elegir —</option>
              {(categoriasQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-0 block text-[10px] uppercase text-slate-600">Proveedor</Label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="h-7 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">— Ninguno —</option>
              {(proveedoresQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stock inicial por local */}
        <div className="rounded border border-slate-200 bg-slate-50 p-1.5">
          <Label className="mb-1 block text-[10px] uppercase text-slate-600">
            Stock inicial por local (opcional)
          </Label>
          <div className="space-y-1">
            {(depositosQ.data ?? []).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs"
              >
                <span className="text-slate-600">{d.nombre}</span>
                <Input
                  type="number"
                  step="1"
                  value={stockInicial[d.id] ?? ''}
                  onChange={(e) =>
                    setStockInicial((prev) => ({ ...prev, [d.id]: e.target.value }))
                  }
                  placeholder="0"
                  className="h-6 w-14 text-right text-xs tabular-nums"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link href="/productos/nuevo">+ Más opciones (web, etc.)</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={crearMut.isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => crearMut.mutate()}
            disabled={crearMut.isPending}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {crearMut.isPending ? 'Creando…' : 'Crear producto'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProductosPage() {
  return (
    <Suspense fallback={null}>
      <ProductosPageInner />
    </Suspense>
  );
}
