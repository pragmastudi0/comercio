'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Globe,
  Search,
  ExternalLink,
  Pencil,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Percent,
  Layers,
  Save,
  Trash2,
  Plus,
} from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@comercio/ui/table';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@comercio/ui/dialog';
import { formatCurrency } from '@comercio/ui/utils';
import { PRESET_IDS, type EscalaMayorista, type FiltroProductos } from '@comercio/db';
import { calcularPrecioMayorista } from '@comercio/business';
import { PaginaProtegida } from '@/lib/permisos';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://turisteando-web.vercel.app';
const PAGE_SIZE = 50;

function WebPageInner() {
  const db = getDb();
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'publicados' | 'ocultos'>('todos');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [texto, filtro]);

  const productosQ = useQuery({
    queryKey: ['productos-web-admin'],
    queryFn: () => db.productos.list({ activo: true }),
  });
  const categoriasQ = useQuery({
    queryKey: ['categorias'],
    queryFn: () => db.categorias.list(),
  });
  const proveedoresQ = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => db.proveedores.list(),
  });
  const configQ = useQuery({
    queryKey: ['config'],
    queryFn: () => db.configuracion.get(PRESET_IDS.empresa),
  });
  // Precio CF de cada producto (primera escala de la lista Consumidor Final).
  // El precio mayorista sale de aplicar el descuento sobre este número.
  const preciosCfQ = useQuery({
    queryKey: ['precios-cf-web-admin', productosQ.data?.length],
    queryFn: async () => {
      const map = new Map<string, number>();
      for (const p of productosQ.data ?? []) {
        const lp = await db.productos.preciosDe(p.id);
        const cf = lp.find((x) => x.lista_precio_id === PRESET_IDS.listas.consumidorFinal);
        const escs = [...(cf?.escalas ?? [])].sort((a, b) => a.desde - b.desde);
        map.set(p.id, escs[0]?.precio ?? 0);
      }
      return map;
    },
    enabled: !!productosQ.data,
  });

  const togglePublicarMut = useMutation({
    mutationFn: ({ id, publicar }: { id: string; publicar: boolean }) =>
      db.productos.update(id, { publicado_web: publicar }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos-web-admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publicarTodosMut = useMutation({
    mutationFn: async (publicar: boolean) => {
      const todos = productosQ.data ?? [];
      let cambios = 0;
      for (const p of todos) {
        if (p.publicado_web !== publicar) {
          await db.productos.update(p.id, { publicado_web: publicar });
          cambios += 1;
        }
      }
      return cambios;
    },
    onSuccess: (cambios) => {
      toast.success(`${cambios} producto(s) actualizado(s)`);
      qc.invalidateQueries({ queryKey: ['productos-web-admin'] });
    },
  });

  const descuentoGlobalPct = configQ.data?.descuento_mayorista_pct ?? 0;
  const escalasGlobales = configQ.data?.escalas_mayorista_cantidad ?? [];

  const productos = productosQ.data ?? [];
  const publicados = productos.filter((p) => p.publicado_web);
  const ocultos = productos.filter((p) => !p.publicado_web);
  const sinFoto = publicados.length; // TODO conectar con imagenesDeMuchos si hace falta afinar
  void sinFoto;

  let visibles = productos;
  if (filtro === 'publicados') visibles = publicados;
  if (filtro === 'ocultos') visibles = ocultos;
  if (texto) {
    const q = texto.toLowerCase();
    visibles = visibles.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.codigo_interno.includes(q),
    );
  }

  const totalVisibles = visibles.length;
  const totalPages = Math.max(1, Math.ceil(totalVisibles / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const desde = pageSafe * PAGE_SIZE;
  const hasta = Math.min(desde + PAGE_SIZE, totalVisibles);
  const pagina = visibles.slice(desde, hasta);

  const categoriaNombre = (id: string) =>
    categoriasQ.data?.find((c) => c.id === id)?.nombre ?? '—';

  const [ajusteOpen, setAjusteOpen] = useState(false);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Online
          </div>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">E-commerce mayorista</h1>
          <p className="text-sm text-muted-foreground">
            Descuentos, escalas y publicación del catálogo web.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={WEB_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              Ver sitio público
            </a>
          </Button>
        </div>
      </div>

      {/* Configuración mayorista global */}
      <ConfigMayorista
        loading={configQ.isLoading}
        descuentoGlobalPct={descuentoGlobalPct}
        escalasGlobales={escalasGlobales}
        onSaved={() => qc.invalidateQueries({ queryKey: ['config'] })}
      />

      {/* KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <KpiCard
          titulo="Productos publicados"
          valor={publicados.length}
          sub="visibles en la web"
          icon={Eye}
          accent
          loading={productosQ.isLoading}
        />
        <KpiCard
          titulo="Productos ocultos"
          valor={ocultos.length}
          sub="cargados pero no visibles"
          icon={EyeOff}
          loading={productosQ.isLoading}
        />
        <KpiCard
          titulo="Total catálogo"
          valor={productos.length}
          sub="productos activos en el sistema"
          icon={Globe}
          loading={productosQ.isLoading}
        />
      </div>

      {/* Acciones rápidas */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={publicarTodosMut.isPending || publicados.length === productos.length}
            onClick={() => {
              if (confirm(`¿Publicar los ${ocultos.length} productos ocultos en la web?`))
                publicarTodosMut.mutate(true);
            }}
          >
            <Eye className="mr-1 h-3 w-3" />
            Publicar todos
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={publicarTodosMut.isPending || ocultos.length === productos.length}
            onClick={() => {
              if (confirm(`¿Ocultar los ${publicados.length} productos publicados?`))
                publicarTodosMut.mutate(false);
            }}
          >
            <EyeOff className="mr-1 h-3 w-3" />
            Ocultar todos
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setAjusteOpen(true)}
            className="ml-auto"
          >
            <Percent className="mr-1 h-3 w-3" />
            Ajuste masivo de descuento
          </Button>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              {totalVisibles === 0
                ? `0 de ${productos.length}`
                : `${desde + 1}–${hasta} de ${totalVisibles}`}
            </CardTitle>
            <div className="flex gap-1 rounded-md border bg-background p-0.5 text-xs">
              <button
                onClick={() => setFiltro('todos')}
                className={`rounded px-2 py-1 ${filtro === 'todos' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltro('publicados')}
                className={`rounded px-2 py-1 ${filtro === 'publicados' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Publicados
              </button>
              <button
                onClick={() => setFiltro('ocultos')}
                className={`rounded px-2 py-1 ${filtro === 'ocultos' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Ocultos
              </button>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {productosQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : totalVisibles === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay productos que coincidan.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Web</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Precio CF</TableHead>
                  <TableHead className="text-right">% desc.</TableHead>
                  <TableHead className="text-right">Precio mayorista</TableHead>
                  <TableHead>Desc. larga</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagina.map((p) => {
                  const cf = preciosCfQ.data?.get(p.id) ?? 0;
                  const calc = calcularPrecioMayorista({
                    precioCF: cf,
                    descuentoOverridePct: p.descuento_mayorista_pct_override,
                    descuentoGlobalPct: descuentoGlobalPct,
                    cantidad: 1,
                    redondeo: 'cent',
                  });
                  const usaOverride = calc.fuente === 'override';
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <ToggleSwitch
                          checked={p.publicado_web}
                          onChange={(v) =>
                            togglePublicarMut.mutate({ id: p.id, publicar: v })
                          }
                          disabled={togglePublicarMut.isPending}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo_interno}</TableCell>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell>{categoriaNombre(p.categoria_id)}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">
                        {formatCurrency(cf)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={usaOverride ? 'font-semibold text-cyan-700' : ''}>
                          {calc.pctAplicado}%
                        </span>
                        {usaOverride && (
                          <span className="ml-1 text-[10px] uppercase text-cyan-600">
                            override
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatCurrency(calc.precio)}
                      </TableCell>
                      <TableCell>
                        {p.descripcion_larga ? (
                          <Badge variant="secondary">Sí</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" title="Editar producto">
                            <Link href={`/productos/${p.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          {p.publicado_web && (
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              title="Ver en la web"
                            >
                              <a
                                href={`${WEB_URL}/catalogo/${p.id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {totalVisibles > PAGE_SIZE && (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row">
            <span className="text-muted-foreground">
              Página {pageSafe + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={pageSafe === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={pageSafe >= totalPages - 1}
              >
                Siguiente <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Tip: el precio mayorista sale de aplicar el descuento sobre el CF. Podés
        setear un override por producto en la sección "Más opciones (e-commerce)"
        del detalle de producto.
      </p>

      {ajusteOpen && (
        <AjusteMasivoDialog
          onClose={() => setAjusteOpen(false)}
          categorias={categoriasQ.data ?? []}
          proveedores={proveedoresQ.data ?? []}
          descuentoGlobalPct={descuentoGlobalPct}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['productos-web-admin'] });
            qc.invalidateQueries({ queryKey: ['producto-detalle'] });
          }}
        />
      )}
    </div>
  );
}

function ConfigMayorista({
  loading,
  descuentoGlobalPct,
  escalasGlobales,
  onSaved,
}: {
  loading: boolean;
  descuentoGlobalPct: number;
  escalasGlobales: EscalaMayorista[];
  onSaved: () => void;
}) {
  const db = getDb();
  const [pctTxt, setPctTxt] = useState(String(descuentoGlobalPct));
  const [escalas, setEscalas] = useState<EscalaMayorista[]>(escalasGlobales);

  // Re-sincronizar cuando la query trae datos frescos.
  useEffect(() => {
    setPctTxt(String(descuentoGlobalPct));
    setEscalas(escalasGlobales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descuentoGlobalPct, JSON.stringify(escalasGlobales)]);

  const guardarMut = useMutation({
    mutationFn: async () => {
      const pctNum = parseFloat(pctTxt);
      const pctClean = Number.isFinite(pctNum) ? Math.max(0, Math.min(100, pctNum)) : 0;
      const escLimpias = escalas
        .filter((e) => e.desde > 0 && e.pct > 0)
        .map((e) => ({
          desde: Math.floor(e.desde),
          pct: Math.max(0, Math.min(100, e.pct)),
        }))
        .sort((a, b) => a.desde - b.desde);
      await db.configuracion.update(PRESET_IDS.empresa, {
        descuento_mayorista_pct: pctClean,
        escalas_mayorista_cantidad: escLimpias.length > 0 ? escLimpias : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Configuración mayorista guardada');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMemo(() => {
    const rows = [1, 5, 10, 25, 50, 100];
    return rows.map((cant) => {
      const calc = calcularPrecioMayorista({
        precioCF: 1000,
        descuentoGlobalPct: parseFloat(pctTxt) || 0,
        escalas,
        cantidad: cant,
      });
      return { cant, pct: calc.pctAplicado, precio: calc.precio };
    });
  }, [pctTxt, escalas]);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-4">
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-cyan-200 bg-cyan-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-cyan-700" />
          Configuración mayorista
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Descuento global */}
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div>
            <Label className="mb-1 block text-xs uppercase text-slate-600">
              Descuento global (%)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={pctTxt}
                onChange={(e) => setPctTxt(e.target.value)}
                className="h-8 w-24 text-sm"
              />
              <span className="text-xs text-slate-600">% sobre CF</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-600">
              Se aplica a todos los productos publicados sin override propio.
            </p>
          </div>

          {/* Escalas por cantidad */}
          <div>
            <Label className="mb-1 block text-xs uppercase text-slate-600">
              Escalas por cantidad (opcional)
            </Label>
            <div className="space-y-1.5">
              {escalas.length === 0 && (
                <p className="text-xs text-slate-500">
                  Sin escalas — solo aplica el descuento global.
                </p>
              )}
              {escalas.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-14 text-xs text-slate-600">Desde</span>
                  <Input
                    type="number"
                    min="1"
                    value={e.desde}
                    onChange={(ev) => {
                      const desde = parseInt(ev.target.value, 10) || 0;
                      setEscalas((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, desde } : x)),
                      );
                    }}
                    className="h-7 w-20 text-sm"
                  />
                  <span className="text-xs text-slate-600">unidades →</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={e.pct}
                    onChange={(ev) => {
                      const pct = parseFloat(ev.target.value) || 0;
                      setEscalas((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, pct } : x)),
                      );
                    }}
                    className="h-7 w-20 text-sm"
                  />
                  <span className="text-xs text-slate-600">% off</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setEscalas((arr) => arr.filter((_, j) => j !== i))
                    }
                    className="h-7 w-7 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEscalas((arr) => [
                    ...arr,
                    { desde: arr.length ? (arr[arr.length - 1]!.desde || 0) + 10 : 10, pct: 0 },
                  ])
                }
                className="h-7 text-xs"
              >
                <Plus className="mr-1 h-3 w-3" />
                Agregar escala
              </Button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded border border-cyan-200 bg-white/60 p-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase text-slate-600">
            <Layers className="h-3 w-3" />
            Preview con precio CF $1.000
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {preview.map((r) => (
              <span
                key={r.cant}
                className="rounded bg-slate-100 px-2 py-0.5 tabular-nums"
              >
                {r.cant}u → {formatCurrency(r.precio)}{' '}
                <span className="text-slate-500">({r.pct}% off)</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => guardarMut.mutate()}
            disabled={guardarMut.isPending}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AjusteMasivoDialog({
  onClose,
  categorias,
  proveedores,
  descuentoGlobalPct,
  onDone,
}: {
  onClose: () => void;
  categorias: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  descuentoGlobalPct: number;
  onDone: () => void;
}) {
  const db = getDb();
  const [alcance, setAlcance] = useState<'publicados' | 'todos' | 'categoria' | 'proveedor'>(
    'publicados',
  );
  const [categoriaId, setCategoriaId] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [modo, setModo] = useState<'setear' | 'limpiar'>('setear');
  const [pctTxt, setPctTxt] = useState('');

  const armarFiltro = (): FiltroProductos => {
    const base: FiltroProductos = { activo: true };
    if (alcance === 'publicados') base.publicado_web = true;
    if (alcance === 'categoria' && categoriaId) base.categoria_id = categoriaId;
    if (alcance === 'proveedor' && proveedorId) base.proveedor_id = proveedorId;
    return base;
  };

  const aplicarMut = useMutation({
    mutationFn: async () => {
      const pct = modo === 'limpiar' ? null : parseFloat(pctTxt);
      if (modo === 'setear' && (!Number.isFinite(pct as number) || (pct as number) < 0)) {
        throw new Error('Ingresá un % válido entre 0 y 100');
      }
      const filtro = armarFiltro();
      return await db.productos.setDescuentoMayoristaMasivo(filtro, pct);
    },
    onSuccess: (n) => {
      toast.success(
        modo === 'limpiar'
          ? `${n} producto(s) volvieron al descuento global (${descuentoGlobalPct}%)`
          : `${n} producto(s) actualizados a ${pctTxt}% off`,
      );
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Ajuste masivo de descuento mayorista</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 p-2">
        <div>
          <Label className="mb-1 block text-xs uppercase text-slate-600">Aplicar a</Label>
          <div className="grid gap-1.5 text-sm">
            {(
              [
                ['publicados', 'Todos los publicados en la web'],
                ['todos', 'Todos los productos activos'],
                ['categoria', 'Una categoría específica'],
                ['proveedor', 'Un proveedor específico'],
              ] as const
            ).map(([val, lbl]) => (
              <label key={val} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="alcance"
                  checked={alcance === val}
                  onChange={() => setAlcance(val)}
                />
                {lbl}
              </label>
            ))}
          </div>
          {alcance === 'categoria' && (
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">— Elegir categoría —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
          {alcance === 'proveedor' && (
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">— Elegir proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <Label className="mb-1 block text-xs uppercase text-slate-600">Qué hacer</Label>
          <div className="space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="modo"
                checked={modo === 'setear'}
                onChange={() => setModo('setear')}
              />
              Setear override
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="ej. 30"
                value={pctTxt}
                onChange={(e) => setPctTxt(e.target.value)}
                className="ml-1 h-7 w-24 text-sm"
                disabled={modo !== 'setear'}
              />
              <span className="text-xs">% off sobre CF</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="modo"
                checked={modo === 'limpiar'}
                onChange={() => setModo('limpiar')}
              />
              Limpiar override → usar el global ({descuentoGlobalPct}%)
            </label>
          </div>
        </div>

        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
          Esta acción afecta a muchos productos a la vez y no tiene deshacer masivo.
          Podés revertir por producto desde el detalle en /productos.
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={
            aplicarMut.isPending ||
            (alcance === 'categoria' && !categoriaId) ||
            (alcance === 'proveedor' && !proveedorId)
          }
          onClick={() => {
            if (!confirm('¿Aplicar el ajuste masivo? No hay deshacer.')) return;
            aplicarMut.mutate();
          }}
        >
          Aplicar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function KpiCard({
  titulo,
  valor,
  sub,
  icon: Icon,
  accent,
  loading,
}: {
  titulo: string;
  valor: number;
  sub: string;
  icon: typeof Globe;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <Card className={accent ? 'border-primary/30 bg-primary/5' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="text-2xl font-bold tabular-nums sm:text-3xl">{valor}</div>
        )}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function WebPage() {
  return (
    <PaginaProtegida modulo="productos" accion="publicar_ecommerce">
      <WebPageInner />
    </PaginaProtegida>
  );
}
