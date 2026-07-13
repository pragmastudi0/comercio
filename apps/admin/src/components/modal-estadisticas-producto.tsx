'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, RefreshCw, ArrowRight } from 'lucide-react';
import { MOTIVOS_INGRESO_STOCK, MOTIVOS_EGRESO_STOCK } from '@comercio/business';
import { getDb } from '@/lib/db';
import {
  motivoLegible,
  origenDeMovimiento,
} from '@/lib/movimientos-stock-helpers';
import { Dialog, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';
import { formatCurrency } from '@comercio/ui/utils';

const LABEL_TIPO_MOV: Record<string, string> = {
  venta: 'Venta',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
  merma: 'Merma',
  transferencia_salida: 'Transferencia salida',
  transferencia_entrada: 'Transferencia entrada',
};

/**
 * Normaliza un motivo para poder comparar tolerando variaciones históricas:
 * mayúsculas ≠ minúsculas, tildes vs sin tildes, espacios sobrantes.
 * Ejemplo: "Corrección de inventario" y "correccion inventario" quedan
 * ambas como "correccion de inventario" (bueno, "correccion inventario"
 * queda igual). Ideal para matchear contra las listas preset.
 */
function normalizarMotivo(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Modal con estadísticas básicas de un producto:
 *  - Última venta (fecha + cajero)
 *  - Cantidad vendida total en los últimos 90 días
 *  - Facturado en los últimos 90 días
 *  - Rotación (cantidad / día promedio)
 *  - Días desde la última venta
 *
 * Trae las ventas de los últimos 90 días y filtra en memoria por
 * producto_id. Si el dueño necesita un reporte más completo (top
 * fechas, rotación por mes, etc.) lo haremos en /reportes después.
 */
export function ModalEstadisticasProducto({
  open,
  onOpenChange,
  productoId,
  productoNombre,
  productoCodigo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productoId: string;
  productoNombre: string;
  productoCodigo: string;
}) {
  const db = getDb();

  const desde = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const ventasQ = useQuery({
    queryKey: ['estad-producto-ventas', productoId, desde],
    queryFn: () => db.ventas.list({ desde }),
    enabled: open,
  });
  const empleadosQ = useQuery({
    queryKey: ['empleados'],
    queryFn: () => db.empleados.list(),
    enabled: open,
  });
  // Movimientos de stock del producto (últimos 90 días). Se pintan agrupados
  // en la sección "Historial de movimientos" abajo, con motivo + origen para
  // que se vea qué canal originó cada uno (PoS vs admin).
  const movsQ = useQuery({
    queryKey: ['estad-producto-movs', productoId, desde],
    queryFn: () => db.stock.movimientos({ producto_id: productoId, desde }),
    enabled: open,
  });
  const depositosQ = useQuery({
    queryKey: ['depositos'],
    queryFn: () => db.depositos.list(),
    enabled: open,
  });
  // Stock actual por depósito — punto de partida para reconstruir "cómo
  // quedó el stock" después de cada movimiento en el historial.
  const stockActualQ = useQuery({
    queryKey: ['estad-producto-stock-actual', productoId],
    queryFn: () => db.stock.porProducto(productoId),
    enabled: open,
    staleTime: 5_000,
  });

  const datos = useMemo(() => {
    const ventas = (ventasQ.data ?? []).filter(
      (v) => v.estado === 'completada' && v.items.some((it) => it.producto_id === productoId),
    );
    let cantidadTotal = 0;
    let facturadoTotal = 0;
    let ventas7d = 0;
    let cantidad7d = 0;
    let ventas30d = 0;
    let cantidad30d = 0;
    let ultima: { fecha: string; empleado_id: string; cantidad: number } | null = null;
    const hace7 = new Date();
    hace7.setDate(hace7.getDate() - 7);
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);

    for (const v of ventas) {
      const items = v.items.filter((it) => it.producto_id === productoId);
      const cantEnVenta = items.reduce((a, it) => a + it.cantidad, 0);
      const factEnVenta = items.reduce(
        (a, it) => a + (it.subtotal ?? it.precio_unitario * it.cantidad),
        0,
      );
      cantidadTotal += cantEnVenta;
      facturadoTotal += factEnVenta;
      const fechaV = new Date(v.fecha);
      if (fechaV >= hace7) {
        ventas7d += 1;
        cantidad7d += cantEnVenta;
      }
      if (fechaV >= hace30) {
        ventas30d += 1;
        cantidad30d += cantEnVenta;
      }
      if (!ultima || fechaV > new Date(ultima.fecha)) {
        ultima = { fecha: v.fecha, empleado_id: v.empleado_id, cantidad: cantEnVenta };
      }
    }

    // Rotación: cantidad promedio por día en los últimos 30 días.
    const rotacion30d = cantidad30d / 30;

    const diasDesdeUltima = ultima
      ? Math.floor(
          (Date.now() - new Date(ultima.fecha).getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      ventas: ventas.length,
      cantidadTotal,
      facturadoTotal,
      ventas7d,
      cantidad7d,
      ventas30d,
      cantidad30d,
      rotacion30d,
      ultima,
      diasDesdeUltima,
    };
  }, [ventasQ.data, productoId]);

  const empleadoNombre = (id: string) => {
    const e = empleadosQ.data?.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido}` : '—';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-6xl">
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-700" />
            Estadísticas del producto
            {ventasQ.isFetching && !ventasQ.isLoading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="mb-3 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
        <div className="font-medium text-slate-800">{productoNombre}</div>
        <div className="font-mono text-xs text-slate-500">#{productoCodigo}</div>
      </div>

      {ventasQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : datos.ventas === 0 ? (
        <div className="rounded-md border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
          Este producto no se vendió en los últimos 90 días.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Última venta */}
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">
              Última venta
            </div>
            {datos.ultima ? (
              <>
                <div className="mt-1 text-base font-semibold text-emerald-900">
                  {new Date(datos.ultima.fecha).toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="text-xs text-emerald-700">
                  Cajero: {empleadoNombre(datos.ultima.empleado_id)} ·{' '}
                  {datos.ultima.cantidad} u · hace{' '}
                  {datos.diasDesdeUltima === 0 ? 'menos de 1 día' : `${datos.diasDesdeUltima} día(s)`}
                </div>
              </>
            ) : (
              <div className="text-xs text-emerald-700">Sin ventas previas.</div>
            )}
          </div>

          {/* KPIs compactados en una sola fila (5 tarjetas). Con el modal
              más ancho entra todo en un vistazo. */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat
              label="Vendidos 7 días"
              valor={datos.cantidad7d}
              sub={`${datos.ventas7d} venta(s)`}
            />
            <Stat
              label="Vendidos 30 días"
              valor={datos.cantidad30d}
              sub={`${datos.ventas30d} venta(s)`}
            />
            <Stat
              label="Vendidos 90 días"
              valor={datos.cantidadTotal}
              sub={`${datos.ventas} venta(s)`}
            />
            <div className="rounded-md border border-slate-300 bg-white p-2 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">
                Rotación 30d
              </div>
              <div className="text-xl font-semibold tabular-nums">
                {datos.rotacion30d.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">u/día</div>
            </div>
            <div className="rounded-md border border-slate-300 bg-emerald-50 p-2 text-center">
              <div className="text-[10px] uppercase text-emerald-800">
                Facturado 90d
              </div>
              <div className="text-lg font-semibold tabular-nums text-emerald-800">
                {formatCurrency(datos.facturadoTotal)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial de movimientos de stock (últimos 90 días).
          Se muestra siempre — incluso si no hubo ventas, puede haber
          transferencias/ajustes que interesa auditar. */}
      <HistorialMovimientos
        movs={movsQ.data ?? []}
        depositos={depositosQ.data ?? []}
        empleados={empleadosQ.data ?? []}
        stockActual={stockActualQ.data ?? []}
        cargando={movsQ.isLoading}
      />

      <div className="mt-4 flex justify-end border-t pt-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-md border bg-background px-4 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Cerrar
        </button>
      </div>
    </Dialog>
  );
}

function Stat({ label, valor, sub }: { label: string; valor: number; sub: string }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{valor}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

/**
 * Tabla compacta con los últimos movimientos de stock del producto.
 * Muestra fecha, tipo, cantidad (con signo), local, motivo, origen (badge
 * PoS o Admin) y empleado. Para transferencias también muestra el par
 * "origen → destino" en la columna local.
 *
 * Se agrupan pares de transferencia (salida+entrada con misma fecha) en
 * una sola fila estilo "De → A" — misma lógica que /admin/movimientos-stock,
 * pero acá aparecen también ventas, ajustes y mermas (todo el historial
 * de stock del producto).
 */
function HistorialMovimientos({
  movs,
  depositos,
  empleados,
  stockActual,
  cargando,
}: {
  movs: Array<{
    id: string;
    tipo: string;
    cantidad: number;
    deposito_id: string;
    empleado_id: string;
    motivo?: string;
    fecha: string;
    producto_id: string;
  }>;
  depositos: Array<{ id: string; nombre: string }>;
  empleados: Array<{ id: string; nombre: string; apellido: string }>;
  /** Stock actual por depósito — se usa como punto de partida para
   *  reconstruir cómo quedaba el stock después de cada movimiento. */
  stockActual: Array<{ deposito_id: string; cantidad: number | string }>;
  cargando: boolean;
}) {
  const depPorId = useMemo(
    () => new Map(depositos.map((d) => [d.id, d.nombre])),
    [depositos],
  );
  const empPorId = useMemo(
    () => new Map(empleados.map((e) => [e.id, `${e.nombre} ${e.apellido ?? ''}`.trim()])),
    [empleados],
  );

  // Agrupar transferencias en pares (salida+entrada con misma fecha+cant).
  // Cada par = 1 fila "De → A". El resto (ventas/ajustes/mermas) queda como
  // filas individuales.
  type Fila =
    | {
        kind: 'transferencia';
        keyPar: string;
        fecha: string;
        cantidad: number;
        origen_id: string;
        destino_id: string;
        empleado_id: string;
        motivo?: string;
        anulada: boolean;
        esAnulacionDe?: string;
      }
    | {
        kind: 'simple';
        id: string;
        fecha: string;
        tipo: string;
        cantidad: number;
        deposito_id: string;
        empleado_id: string;
        motivo?: string;
      };

  const filas = useMemo<Fila[]>(() => {
    const transf = movs.filter(
      (m) => m.tipo === 'transferencia_salida' || m.tipo === 'transferencia_entrada',
    );
    const otras = movs.filter(
      (m) => m.tipo !== 'transferencia_salida' && m.tipo !== 'transferencia_entrada',
    );
    // Pares por (cantidad + fecha redondeada al segundo) — antes usaba
    // la fecha exacta, pero los transferenciaInmediata históricos
    // guardaban 2 movs con timestamps que diferían en microsegundos.
    // Con el redondeo, los pares se agrupan bien tanto los nuevos como
    // los históricos.
    const grupos = new Map<string, { salida?: typeof movs[number]; entrada?: typeof movs[number] }>();
    for (const m of transf) {
      const fechaSeg = m.fecha.slice(0, 19);
      const key = `${m.cantidad}|${fechaSeg}`;
      const g = grupos.get(key) ?? {};
      if (m.tipo === 'transferencia_salida') g.salida = m;
      else g.entrada = m;
      grupos.set(key, g);
    }
    const anuladasIds = new Set<string>();
    const pares: Fila[] = [];
    for (const [, g] of grupos) {
      if (!g.salida || !g.entrada) continue;
      const motivo = g.salida.motivo ?? '';
      const matchAnul = /^Anulaci[óo]n de transferencia (\S+)/.exec(motivo);
      pares.push({
        kind: 'transferencia',
        keyPar: g.salida.id,
        fecha: g.salida.fecha,
        cantidad: g.salida.cantidad,
        origen_id: g.salida.deposito_id,
        destino_id: g.entrada.deposito_id,
        empleado_id: g.salida.empleado_id,
        motivo: g.salida.motivo,
        anulada: false,
        esAnulacionDe: matchAnul?.[1],
      });
      if (matchAnul) anuladasIds.add(matchAnul[1]!);
    }
    for (const p of pares) {
      if (p.kind === 'transferencia' && anuladasIds.has(p.keyPar)) p.anulada = true;
    }
    const simples: Fila[] = otras.map((m) => ({
      kind: 'simple',
      id: m.id,
      fecha: m.fecha,
      tipo: m.tipo,
      cantidad: m.cantidad,
      deposito_id: m.deposito_id,
      empleado_id: m.empleado_id,
      motivo: m.motivo,
    }));
    return [...pares, ...simples].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [movs]);

  // Calculamos el "stock después" de cada movimiento reconstruyendo hacia
  // atrás desde el stock actual. Estrategia: para cada fila (ordenadas
  // desc por fecha), el saldo "después" del movimiento es el puntero
  // actual; después ajustamos el puntero restando el delta para tener el
  // estado ANTES del mov (que es el "después" del siguiente hacia atrás).
  //
  // Cuidado con los ajustes: en la BD guardamos cantidad=|delta| y perdemos
  // el signo del delta original. Para esos movs el "stock después" queda
  // como el actual del puntero, pero no ajustamos hacia atrás (marcado con
  // '?' visualmente). Es una limitación conocida del schema; se puede
  // resolver con una columna nueva en BD si molesta.
  type FilaConSaldo = Fila & {
    /** Snapshot COMPLETO de stock por depósito DESPUÉS de este mov.
     *  Incluye todos los depósitos que aparecen en el stock actual, no
     *  solo los que este mov tocó — para que la tabla tenga una columna
     *  fija por depósito y se lea todo el estado del producto en cada
     *  línea del historial. */
    saldoPorDeposito: Map<string, number>;
    /** Suma de stock del producto en todos los depósitos después de este mov. */
    saldoTotal: number;
    /** true si es un ajuste y no podemos calcular el delta con certeza. */
    saldoIncierto?: boolean;
  };
  const filasConSaldo = useMemo<FilaConSaldo[]>(() => {
    // Punteros de stock actual por depósito.
    const punteros = new Map<string, number>();
    for (const s of stockActual ?? []) {
      punteros.set(s.deposito_id, Number(s.cantidad));
    }
    let totalActual = 0;
    for (const v of punteros.values()) totalActual += v;

    const out: FilaConSaldo[] = [];
    for (const f of filas) {
      // Snapshot DESPUÉS del mov = estado actual de los punteros ANTES
      // de retroceder. Clonamos el Map completo y también capturamos el
      // total en este momento para que quede coherente con las columnas
      // (bug histórico: antes guardábamos el total DESPUÉS de restar el
      // delta, entonces la columna Total mostraba el saldo previo al
      // mov mientras las columnas por depósito mostraban el saldo
      // posterior — no coincidían).
      const saldoPorDeposito = new Map(punteros);
      const saldoTotalSnapshot = totalActual;
      let saldoIncierto = false;

      if (f.kind === 'transferencia') {
        // Retroceder: antes del mov, origen tenía +cant y destino -cant.
        // Total neto = 0.
        const dOr = punteros.get(f.origen_id) ?? 0;
        const dDe = punteros.get(f.destino_id) ?? 0;
        punteros.set(f.origen_id, dOr + f.cantidad);
        punteros.set(f.destino_id, dDe - f.cantidad);
      } else {
        // Simple: afecta un depósito.
        const d = punteros.get(f.deposito_id) ?? 0;
        let delta = 0;
        if (
          f.tipo === 'venta' ||
          f.tipo === 'merma'
        ) {
          delta = -f.cantidad;
        } else if (f.tipo === 'devolucion') {
          delta = f.cantidad;
        } else if (f.tipo === 'ajuste') {
          // El signo del delta no queda en BD (cantidad se guarda en
          // valor absoluto), así que lo inferimos del motivo. Prioridad:
          //   1) Auto-transfers del sistema: patrón fijo "Auto-transfer
          //      desde ..." (ingreso) / "Auto-transfer a ..." (egreso).
          //   2) Motivos preset (MOTIVOS_INGRESO_STOCK / MOTIVOS_EGRESO_STOCK)
          //      comparados case-insensitive y sin tildes, para tolerar
          //      variaciones históricas ("correccion inventario" ≡
          //      "Corrección de inventario").
          //   3) Si nada matchea → saldoIncierto = mostramos "?".
          const m = f.motivo ?? '';
          const mNorm = normalizarMotivo(m);
          if (mNorm.startsWith('auto-transfer desde')) {
            delta = f.cantidad;
          } else if (mNorm.startsWith('auto-transfer a ')) {
            delta = -f.cantidad;
          } else if (
            (MOTIVOS_INGRESO_STOCK as readonly string[]).some(
              (x) => normalizarMotivo(x) === mNorm,
            )
          ) {
            delta = f.cantidad;
          } else if (
            (MOTIVOS_EGRESO_STOCK as readonly string[]).some(
              (x) => normalizarMotivo(x) === mNorm,
            )
          ) {
            delta = -f.cantidad;
          } else {
            saldoIncierto = true;
          }
        }
        if (delta !== 0) {
          punteros.set(f.deposito_id, d - delta);
          totalActual -= delta;
        }
      }
      out.push({
        ...f,
        saldoPorDeposito,
        saldoTotal: saldoTotalSnapshot,
        saldoIncierto,
      });
    }
    return out;
  }, [filas, stockActual]);

  // Lista de depósitos a renderizar como columnas fijas. Mostramos TODOS
  // los depósitos del sistema — no solo los que tienen fila en
  // stock_items para este producto — porque cuando el dueño está
  // corrigiendo inventario necesita ver la columna aunque el producto
  // no haya tenido stock en ese depósito nunca (para poder darse
  // cuenta de que le falta cargar ahí).
  //
  // Además incluimos "huérfanos": depósitos que aparecen en stockActual
  // pero no están en la lista principal — no debería pasar, pero si
  // sucede queremos verlos igual.
  const depositosVisibles = useMemo(() => {
    const yaInclidos = new Set(depositos.map((d) => d.id));
    const idsEnStock = new Set(
      (stockActual ?? []).map((s) => s.deposito_id),
    );
    const huerfanos = [...idsEnStock]
      .filter((id) => !yaInclidos.has(id))
      .map((id) => ({ id, nombre: '—' }));
    return [...depositos, ...huerfanos];
  }, [depositos, stockActual]);

  function fmtFecha(iso: string): string {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Signo visual de la cantidad según tipo:
  //   'venta' | 'merma' | 'transferencia_salida' → -N (rojo)
  //   'devolucion' | 'transferencia_entrada'     → +N (verde)
  //   'ajuste' → +N o -N según valor real (el signo se guarda perdido en
  //             la BD: cantidad es siempre positivo, el "delta real" del
  //             ajuste solo se conoce en el motivo). Marcamos como neutro.
  function signoTipo(tipo: string): 'positivo' | 'negativo' | 'neutro' {
    if (
      tipo === 'venta' ||
      tipo === 'merma' ||
      tipo === 'transferencia_salida'
    )
      return 'negativo';
    if (tipo === 'devolucion' || tipo === 'transferencia_entrada')
      return 'positivo';
    return 'neutro';
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          Historial de movimientos de stock (90 días)
        </div>
        <div className="text-[10px] text-muted-foreground">{filas.length} en total</div>
      </div>
      {cargando ? (
        <Skeleton className="h-24" />
      ) : filas.length === 0 ? (
        <p className="rounded border border-dashed py-3 text-center text-xs text-muted-foreground">
          No hubo movimientos de este producto en los últimos 90 días.
        </p>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/60 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Fecha</th>
                <th className="px-2 py-1 text-left">Tipo</th>
                <th
                  className="px-2 py-1 text-right"
                  title="Cantidad movida en este movimiento (con signo según tipo)"
                >
                  Movimiento
                </th>
                <th className="px-2 py-1 text-left">Local</th>
                {/* Una columna por depósito: cómo quedó el stock del
                    producto en ESE depósito después del mov. */}
                {depositosVisibles.map((d) => (
                  <th
                    key={d.id}
                    className="whitespace-nowrap px-2 py-1 text-right"
                    title={`Stock en ${d.nombre} después de este movimiento`}
                  >
                    {d.nombre}
                  </th>
                ))}
                <th
                  className="border-l px-2 py-1 text-right font-semibold"
                  title="Suma de stock del producto en todos los depósitos después de este movimiento"
                >
                  Total
                </th>
                <th className="px-2 py-1 text-left">Motivo</th>
                <th className="px-2 py-1 text-left">Origen</th>
                <th className="px-2 py-1 text-left">Empleado</th>
              </tr>
            </thead>
            <tbody>
              {filasConSaldo.map((f) => {
                const empNombre = empPorId.get(f.empleado_id) ?? '—';
                if (f.kind === 'transferencia') {
                  const opac = f.anulada || f.esAnulacionDe ? 'opacity-60' : '';
                  return (
                    <tr key={f.keyPar} className={`border-t border-border/50 ${opac}`}>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                        {fmtFecha(f.fecha)}
                      </td>
                      <td className="px-2 py-1">Transferencia</td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums">
                        {f.cantidad}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">
                        <span>{depPorId.get(f.origen_id) ?? '—'}</span>
                        <ArrowRight className="mx-0.5 inline h-3 w-3 text-muted-foreground" />
                        <span>{depPorId.get(f.destino_id) ?? '—'}</span>
                      </td>
                      {depositosVisibles.map((d) => {
                        const val = f.saldoPorDeposito.get(d.id) ?? 0;
                        const esOrigenODestino =
                          d.id === f.origen_id || d.id === f.destino_id;
                        return (
                          <td
                            key={d.id}
                            className={`px-2 py-1 text-right tabular-nums ${
                              esOrigenODestino ? 'bg-blue-50/50 font-medium' : ''
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                      <td className="border-l px-2 py-1 text-right font-semibold tabular-nums">
                        {f.saldoTotal}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {motivoLegible(f.motivo)}
                      </td>
                      <td className="px-2 py-1">
                        {/* Fila transferencia: no tiene .tipo, solo motivo. */}
                        <OrigenBadge origen={origenDeMovimiento(f.motivo)} />
                      </td>
                      <td className="px-2 py-1">{empNombre}</td>
                    </tr>
                  );
                }
                const signo = signoTipo(f.tipo);
                return (
                  <tr key={f.id} className="border-t border-border/50">
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                      {fmtFecha(f.fecha)}
                    </td>
                    <td className="px-2 py-1">{LABEL_TIPO_MOV[f.tipo] ?? f.tipo}</td>
                    <td
                      className={`px-2 py-1 text-right font-medium tabular-nums ${
                        signo === 'positivo'
                          ? 'text-emerald-700'
                          : signo === 'negativo'
                            ? 'text-destructive'
                            : ''
                      }`}
                    >
                      {signo === 'positivo' ? '+' : signo === 'negativo' ? '−' : ''}
                      {f.cantidad}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {depPorId.get(f.deposito_id) ?? '—'}
                    </td>
                    {depositosVisibles.map((d) => {
                      const val = f.saldoPorDeposito.get(d.id) ?? 0;
                      const esAfectado = d.id === f.deposito_id;
                      return (
                        <td
                          key={d.id}
                          className={`px-2 py-1 text-right tabular-nums ${
                            esAfectado ? 'bg-blue-50/50 font-medium' : ''
                          }`}
                          title={
                            f.saldoIncierto && esAfectado
                              ? 'No podemos calcular el saldo previo con certeza (ajuste con motivo libre).'
                              : undefined
                          }
                        >
                          {f.saldoIncierto && esAfectado ? `${val} ?` : val}
                        </td>
                      );
                    })}
                    <td className="border-l px-2 py-1 text-right font-semibold tabular-nums">
                      {f.saldoTotal}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {motivoLegible(f.motivo)}
                    </td>
                    <td className="px-2 py-1">
                      <OrigenBadge origen={origenDeMovimiento(f.motivo, f.tipo)} />
                    </td>
                    <td className="px-2 py-1">{empNombre}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrigenBadge({ origen }: { origen: 'pos' | 'admin' }) {
  if (origen === 'pos') {
    return (
      <Badge
        variant="outline"
        className="border-blue-300 bg-blue-50 text-blue-800"
        title="Cargado por un cajero desde el botón Stock del PoS"
      >
        PoS
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-purple-300 bg-purple-50 text-purple-800"
      title="Cargado desde el admin (encargado o dueño)"
    >
      Admin
    </Badge>
  );
}
