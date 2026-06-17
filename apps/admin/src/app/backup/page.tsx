'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { Download, Lock, Database, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useSesion } from '@/stores/sesion';
import { getDb } from '@/lib/db';
import { PRESET_IDS } from '@comercio/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';

const ADMIN_ROLE_ID = PRESET_IDS.roles.admin;

const LABEL_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR',
  cta_cte: 'Cta corriente',
};

const LABEL_ESTADO: Record<string, string> = {
  completada: 'Completada',
  anulada: 'Anulada',
  presupuesto: 'Presupuesto',
};

const LABEL_TIPO_MOV_CAJA: Record<string, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  retiro: 'Retiro',
  cobro: 'Cobro',
  anulacion: 'Anulación',
};

const LABEL_TIPO_MOV_STOCK: Record<string, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  ajuste: 'Ajuste',
  merma: 'Merma',
  venta: 'Venta',
  anulacion_venta: 'Anulación de venta',
  nota_credito: 'Nota de crédito',
  transferencia_salida: 'Transf. salida',
  transferencia_entrada: 'Transf. entrada',
};

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BackupPage() {
  const db = getDb();
  const empleado = useSesion((s) => s.empleado);
  const esAdmin = empleado?.rol_id === ADMIN_ROLE_ID;

  const hoy = format(new Date(), 'yyyy-MM-dd');
  const haceMes = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const [desde, setDesde] = useState(haceMes);
  const [hasta, setHasta] = useState(hoy);
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState<string>('');

  async function generarBackup() {
    if (!esAdmin) {
      toast.error('Solo el rol Admin puede generar backups');
      return;
    }
    if (!desde || !hasta) {
      toast.error('Indicá un rango de fechas');
      return;
    }
    if (desde > hasta) {
      toast.error('La fecha "Desde" no puede ser mayor a "Hasta"');
      return;
    }

    setGenerando(true);
    setProgreso('Preparando…');

    try {
      const desdeISO = new Date(`${desde}T00:00:00`).toISOString();
      const hastaISO = new Date(`${hasta}T23:59:59`).toISOString();

      // 1) Cargar diccionarios (productos / empleados / locales / cajas /
      //    depósitos / clientes) — para resolver UUIDs a nombres en las
      //    columnas del XLSX. Se hace una sola vez.
      setProgreso('Cargando catálogos…');
      const [productos, empleados, locales, cajas, depositos, clientes] =
        await Promise.all([
          db.productos.list(),
          db.empleados.list(),
          db.locales.list(),
          db.cajas.list(),
          db.depositos.list(),
          db.clientes.list(),
        ]);

      const prodPorId = new Map(productos.map((p) => [p.id, p]));
      const empPorId = new Map(empleados.map((e) => [e.id, e]));
      const locPorId = new Map(locales.map((l) => [l.id, l]));
      const cajaPorId = new Map(cajas.map((c) => [c.id, c]));
      const depPorId = new Map(depositos.map((d) => [d.id, d]));
      const cliPorId = new Map(clientes.map((c) => [c.id, c]));

      const productoLabel = (id: string) => {
        const p = prodPorId.get(id);
        return p ? `${p.codigo_interno} · ${p.nombre}` : id;
      };
      const productoCodigo = (id: string) => prodPorId.get(id)?.codigo_interno ?? '';
      const productoNombre = (id: string) => prodPorId.get(id)?.nombre ?? '';
      const empleadoNombre = (id?: string | null) => {
        if (!id) return '';
        const e = empPorId.get(id);
        return e ? `${e.nombre} ${e.apellido}` : id;
      };
      const localNombre = (id?: string | null) => (id ? locPorId.get(id)?.nombre ?? id : '');
      const cajaNombre = (id?: string | null) => (id ? cajaPorId.get(id)?.nombre ?? id : '');
      const depositoNombre = (id?: string | null) =>
        id ? depPorId.get(id)?.nombre ?? id : '';
      const clienteNombre = (id?: string | null) => {
        if (!id) return 'Consumidor final';
        const c = cliPorId.get(id);
        if (!c) return id;
        return `${c.nombre} ${c.apellido}`.trim() || c.id;
      };

      // 2) Cargar datos transaccionales del rango.
      setProgreso('Descargando ventas, sesiones, movimientos…');
      const [ventas, sesiones, movsStock, notasCredito] = await Promise.all([
        db.ventas.list({ desde: desdeISO, hasta: hastaISO }),
        db.sesionesCaja.list({ desde: desdeISO, hasta: hastaISO }),
        db.stock.movimientos({ desde: desdeISO, hasta: hastaISO }),
        db.notasCredito.list({ desde: desdeISO, hasta: hastaISO }),
      ]);

      setProgreso('Descargando movimientos de caja…');
      const movsCajaPorSesion = await Promise.all(
        sesiones.map((s) => db.sesionesCaja.movimientos(s.id)),
      );
      const movsCaja = movsCajaPorSesion.flat();

      // 3) Armar las hojas del workbook con columnas humanas.
      setProgreso('Generando hojas Excel…');

      const ventasRows = ventas.map((v) => ({
        'N°': v.numero,
        Fecha: fmtFecha(v.fecha),
        Estado: LABEL_ESTADO[v.estado] ?? v.estado,
        Local: localNombre(v.local_id),
        Caja: cajaNombre(v.caja_id),
        Cajero: empleadoNombre(v.empleado_id),
        Cliente: clienteNombre(v.cliente_id),
        Items: v.items.reduce((a, i) => a + i.cantidad, 0),
        Subtotal: v.subtotal,
        Descuento: v.descuento_total,
        Recargo: v.recargo_total,
        Total: v.total,
        'Anulada por': empleadoNombre(v.anulada_por),
        'Anulada en': fmtFecha(v.anulada_en),
        'Motivo anulación': v.motivo_anulacion ?? '',
      }));

      const itemsRows = ventas.flatMap((v) =>
        v.items.map((it) => ({
          'Venta N°': v.numero,
          Fecha: fmtFecha(v.fecha),
          Código: productoCodigo(it.producto_id),
          Producto: productoNombre(it.producto_id),
          Cantidad: it.cantidad,
          'Precio unitario': it.precio_unitario,
          'Descuento %': it.descuento_pct ?? 0,
          Subtotal: it.subtotal,
        })),
      );

      const pagosRows = ventas.flatMap((v) =>
        v.pagos.map((p) => ({
          'Venta N°': v.numero,
          Fecha: fmtFecha(v.fecha),
          Método: LABEL_METODO[p.metodo] ?? p.metodo,
          Monto: p.monto,
          Cuotas: p.cuotas ?? '',
          'Recargo %': p.recargo_pct ?? 0,
        })),
      );

      const sesionesRows = sesiones.map((s) => {
        const cerrada = (s as { cerrada_en?: string }).cerrada_en;
        return {
          Caja: cajaNombre(s.caja_id),
          Cajero: empleadoNombre(s.empleado_id),
          'Saldo inicial': s.saldo_inicial,
          'Saldo declarado': s.saldo_final_declarado ?? '',
          Apertura: fmtFecha(s.abierta_en),
          Cierre: fmtFecha(cerrada ?? null),
          Estado: cerrada ? 'Cerrada' : 'Abierta',
        };
      });

      // Para movimientos de caja necesitamos saber a qué sesión pertenecen
      // para mostrar Caja/Cajero en cada fila — los buscamos por id.
      const sesionPorId = new Map(sesiones.map((s) => [s.id, s]));
      const movsCajaRows = movsCaja.map((m) => {
        const sesion = sesionPorId.get(m.sesion_caja_id);
        return {
          Fecha: fmtFecha(m.fecha),
          Caja: cajaNombre(sesion?.caja_id),
          Cajero: empleadoNombre(m.empleado_id),
          Tipo: LABEL_TIPO_MOV_CAJA[m.tipo] ?? m.tipo,
          Método: LABEL_METODO[m.metodo] ?? m.metodo,
          Monto: m.monto,
          'Motivo / Ref': (m as { motivo?: string }).motivo ?? '',
        };
      });

      const movsStockRows = movsStock.map((m) => ({
        Fecha: fmtFecha(m.fecha),
        Código: productoCodigo(m.producto_id),
        Producto: productoNombre(m.producto_id),
        Depósito: depositoNombre(m.deposito_id),
        Tipo: LABEL_TIPO_MOV_STOCK[m.tipo] ?? m.tipo,
        Cantidad: m.cantidad,
        Empleado: empleadoNombre(m.empleado_id),
        Motivo: (m as { motivo?: string }).motivo ?? '',
      }));

      const ncRows = notasCredito.map((n) => ({
        'N°': n.numero,
        Fecha: fmtFecha(n.fecha),
        'Venta original': ventas.find((v) => v.id === n.venta_id)?.numero ?? n.venta_id,
        Empleado: empleadoNombre(n.empleado_id),
        Motivo: n.motivo,
        Total: n.monto_total,
      }));

      const ncItemsRows = notasCredito.flatMap((n) =>
        n.items.map((it) => ({
          'NC N°': n.numero,
          Fecha: fmtFecha(n.fecha),
          Código: productoCodigo(it.producto_id),
          Producto: productoNombre(it.producto_id),
          Cantidad: it.cantidad,
          'Precio unitario': it.precio_unitario,
          Subtotal: it.subtotal,
        })),
      );

      const clientesRows = clientes.map((c) => ({
        Nombre: `${c.nombre} ${c.apellido}`.trim(),
        DNI: c.dni ?? '',
        CUIT: c.cuit ?? '',
        Teléfono: c.telefono ?? '',
        Email: c.email ?? '',
        Dirección: c.direccion ?? '',
        'C. Postal': c.codigo_postal ?? '',
        'Límite crédito': c.limite_credito ?? '',
        Saldo: c.saldo,
        Suspendido: c.suspendido ? 'Sí' : 'No',
        Activo: c.activo ? 'Sí' : 'No',
        'Alta del cliente': fmtFecha(c.creado_en),
      }));

      const resumenRows = [
        { Concepto: '#Turisteando — Backup transaccional', Valor: '' },
        { Concepto: 'Rango', Valor: `${desde} → ${hasta}` },
        { Concepto: 'Generado', Valor: new Date().toLocaleString('es-AR') },
        {
          Concepto: 'Generado por',
          Valor: `${empleado?.nombre ?? ''} ${empleado?.apellido ?? ''}`.trim(),
        },
        { Concepto: '', Valor: '' },
        { Concepto: 'Ventas totales', Valor: ventas.length },
        {
          Concepto: '  · completadas',
          Valor: ventas.filter((v) => v.estado === 'completada').length,
        },
        {
          Concepto: '  · anuladas',
          Valor: ventas.filter((v) => v.estado === 'anulada').length,
        },
        {
          Concepto: '  · presupuestos',
          Valor: ventas.filter((v) => v.estado === 'presupuesto').length,
        },
        {
          Concepto: 'Total facturado (completadas)',
          Valor: ventas
            .filter((v) => v.estado === 'completada')
            .reduce((a, v) => a + v.total, 0),
        },
        {
          Concepto: 'Total descuentos (completadas)',
          Valor: ventas
            .filter((v) => v.estado === 'completada')
            .reduce((a, v) => a + (v.descuento_total ?? 0), 0),
        },
        { Concepto: 'Sesiones de caja', Valor: sesiones.length },
        { Concepto: 'Movimientos de caja', Valor: movsCaja.length },
        { Concepto: 'Movimientos de stock', Valor: movsStock.length },
        { Concepto: 'Notas de crédito', Valor: notasCredito.length },
        { Concepto: 'Clientes (snapshot)', Valor: clientes.length },
      ];

      // 4) Construir el workbook.
      setProgreso('Comprimiendo Excel…');
      const wb = XLSX.utils.book_new();

      const append = (sheetName: string, rows: Record<string, unknown>[]) => {
        // Si la hoja está vacía meto una sola fila con texto explicativo
        // para que la pestaña no quede vacía y confunda.
        const data =
          rows.length > 0
            ? rows
            : [{ '(sin datos)': 'No hubo registros en el rango seleccionado' }];
        const ws = XLSX.utils.json_to_sheet(data);
        // Ajustar ancho de columnas según contenido (heurística simple).
        const cols = Object.keys(data[0]!);
        ws['!cols'] = cols.map((k) => {
          const maxLen = Math.max(
            k.length,
            ...data.map((r) => String(r[k] ?? '').length),
          );
          return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
        });
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      };

      append('Resumen', resumenRows);
      append('Ventas', ventasRows);
      append('Items vendidos', itemsRows);
      append('Pagos', pagosRows);
      append('Cajas', sesionesRows);
      append('Movimientos caja', movsCajaRows);
      append('Movimientos stock', movsStockRows);
      append('Notas crédito', ncRows);
      append('NC - items', ncItemsRows);
      append('Clientes', clientesRows);

      // 5) Descargar.
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `turisteando-backup_${desde}_${hasta}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      toast.success(
        `Backup generado · ${ventas.length} ventas, ${sesiones.length} sesiones`,
      );
      setProgreso('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`Error generando backup: ${msg}`);
      setProgreso('');
    } finally {
      setGenerando(false);
    }
  }

  if (!esAdmin) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Acceso restringido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Esta sección solo está disponible para el rol <b>Admin</b>. Pedile al dueño que
              te genere el backup, o que te cambie el rol si necesitás acceso permanente.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Backup de datos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Descargá un archivo <code>.xlsx</code> que se abre directo en Excel o Google Sheets.
          Sirve como respaldo, para auditoría o para pasar al contador.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Generar backup transaccional
          </CardTitle>
          <CardDescription>
            Incluye: ventas (cabeceras, items y pagos), movimientos de caja, movimientos de
            stock, notas de crédito y snapshot de clientes. Cada sección es una hoja del
            Excel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bk-desde" className="mb-1 block">
                Desde
              </Label>
              <Input
                id="bk-desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                disabled={generando}
              />
            </div>
            <div>
              <Label htmlFor="bk-hasta" className="mb-1 block">
                Hasta
              </Label>
              <Input
                id="bk-hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                disabled={generando}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDesde(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
                setHasta(hoy);
              }}
              disabled={generando}
            >
              Últimos 7 días
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDesde(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
                setHasta(hoy);
              }}
              disabled={generando}
            >
              Últimos 30 días
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDesde(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
                setHasta(hoy);
              }}
              disabled={generando}
            >
              Últimos 90 días
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDesde('2024-01-01');
                setHasta(hoy);
              }}
              disabled={generando}
            >
              Todo
            </Button>
          </div>

          <Button
            type="button"
            onClick={generarBackup}
            disabled={generando}
            className="w-full sm:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            {generando ? progreso || 'Generando…' : 'Descargar backup (.xlsx)'}
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            Hojas que incluye el Excel
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="space-y-1.5 text-muted-foreground">
            <li>
              <b className="text-foreground">Resumen</b> — totales del período (ventas,
              facturado, descuentos, anulaciones, etc.)
            </li>
            <li>
              <b className="text-foreground">Ventas</b> — N°, fecha, cajero, cliente, total y
              estado
            </li>
            <li>
              <b className="text-foreground">Items vendidos</b> — código + nombre del
              producto, cantidad, precio
            </li>
            <li>
              <b className="text-foreground">Pagos</b> — método y monto por venta
            </li>
            <li>
              <b className="text-foreground">Cajas</b> — apertura/cierre por cajero
            </li>
            <li>
              <b className="text-foreground">Movimientos caja</b> — ingresos / egresos /
              retiros / cobros
            </li>
            <li>
              <b className="text-foreground">Movimientos stock</b> — entradas, salidas,
              ajustes, mermas
            </li>
            <li>
              <b className="text-foreground">Notas crédito</b> + <b className="text-foreground">NC - items</b> — devoluciones
            </li>
            <li>
              <b className="text-foreground">Clientes</b> — listado completo (snapshot al
              momento)
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-4 border-amber-200 bg-amber-50">
        <CardContent className="flex gap-3 pt-6 text-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-700" />
          <div className="text-amber-900">
            <b>Guardá los backups en un lugar seguro</b> (Google Drive, Dropbox, disco
            externo). Te recomendamos generar uno al cierre de cada mes y antes de cualquier
            cambio importante (alta masiva de productos, importación de catálogo, etc.).
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
