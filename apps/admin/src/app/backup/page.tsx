'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { Download, Lock, Database, FileArchive, AlertTriangle } from 'lucide-react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { useSesion } from '@/stores/sesion';
import { getDb } from '@/lib/db';
import { PRESET_IDS } from '@comercio/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { toCsv } from '@/lib/csv';

const ADMIN_ROLE_ID = PRESET_IDS.roles.admin;

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

      // Consultas en paralelo
      setProgreso('Descargando ventas, sesiones, movimientos…');
      const [ventas, sesiones, movsStock, notasCredito, clientes] = await Promise.all([
        db.ventas.list({ desde: desdeISO, hasta: hastaISO }),
        db.sesionesCaja.list({ desde: desdeISO, hasta: hastaISO }),
        db.stock.movimientos({ desde: desdeISO, hasta: hastaISO }),
        db.notasCredito.list({ desde: desdeISO, hasta: hastaISO }),
        db.clientes.list(),
      ]);

      // Movimientos de caja: traer uno por sesión
      setProgreso('Descargando movimientos de caja…');
      const movsCajaPorSesion = await Promise.all(
        sesiones.map((s) => db.sesionesCaja.movimientos(s.id)),
      );
      const movsCaja = movsCajaPorSesion.flat();

      // Generar CSVs
      setProgreso('Generando CSVs…');

      const csvVentas = toCsv(
        ventas.map((v) => ({
          id: v.id,
          numero: v.numero,
          fecha: v.fecha,
          estado: v.estado,
          local_id: v.local_id,
          caja_id: v.caja_id,
          sesion_caja_id: v.sesion_caja_id,
          empleado_id: v.empleado_id,
          cliente_id: v.cliente_id ?? '',
          subtotal: v.subtotal,
          descuento_total: v.descuento_total,
          recargo_total: v.recargo_total,
          total: v.total,
          items_qty: v.items.length,
          anulada_por: v.anulada_por ?? '',
          anulada_en: v.anulada_en ?? '',
          motivo_anulacion: v.motivo_anulacion ?? '',
        })),
      );

      const csvVentasItems = toCsv(
        ventas.flatMap((v) =>
          v.items.map((it) => ({
            venta_id: v.id,
            venta_numero: v.numero,
            venta_fecha: v.fecha,
            producto_id: it.producto_id,
            variante_id: it.variante_id ?? '',
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            descuento_pct: it.descuento_pct ?? 0,
            subtotal: it.subtotal,
          })),
        ),
      );

      const csvVentasPagos = toCsv(
        ventas.flatMap((v) =>
          v.pagos.map((p) => ({
            venta_id: v.id,
            venta_numero: v.numero,
            venta_fecha: v.fecha,
            metodo: p.metodo,
            monto: p.monto,
            cuotas: p.cuotas ?? '',
            recargo_pct: p.recargo_pct ?? 0,
          })),
        ),
      );

      const csvSesionesCaja = toCsv(
        sesiones.map((s) => ({
          id: s.id,
          caja_id: s.caja_id,
          empleado_id: s.empleado_id,
          saldo_inicial: s.saldo_inicial,
          saldo_final_declarado: s.saldo_final_declarado ?? '',
          abierta_en: s.abierta_en,
          cerrada_en: (s as { cerrada_en?: string }).cerrada_en ?? '',
        })),
      );

      const csvMovsCaja = toCsv(
        movsCaja.map((m) => ({
          id: m.id,
          sesion_caja_id: m.sesion_caja_id,
          tipo: m.tipo,
          metodo: m.metodo,
          monto: m.monto,
          venta_id: (m as { venta_id?: string }).venta_id ?? '',
          empleado_id: m.empleado_id,
          fecha: m.fecha,
        })),
      );

      const csvMovsStock = toCsv(
        movsStock.map((m) => ({
          id: m.id,
          producto_id: m.producto_id,
          variante_id: (m as { variante_id?: string }).variante_id ?? '',
          deposito_id: m.deposito_id,
          tipo: m.tipo,
          cantidad: m.cantidad,
          referencia_id: (m as { referencia_id?: string }).referencia_id ?? '',
          motivo: (m as { motivo?: string }).motivo ?? '',
          empleado_id: m.empleado_id,
          fecha: m.fecha,
        })),
      );

      const csvNotasCredito = toCsv(
        notasCredito.map((n) => ({
          id: n.id,
          numero: n.numero,
          venta_id: n.venta_id,
          empleado_id: n.empleado_id,
          motivo: n.motivo,
          monto_total: n.monto_total,
          fecha: n.fecha,
        })),
      );

      const csvNotasCreditoItems = toCsv(
        notasCredito.flatMap((n) =>
          n.items.map((it) => ({
            nota_id: n.id,
            nota_numero: n.numero,
            fecha: n.fecha,
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal: it.subtotal,
          })),
        ),
      );

      const csvClientes = toCsv(
        clientes.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          apellido: c.apellido,
          dni: c.dni ?? '',
          cuit: c.cuit ?? '',
          telefono: c.telefono ?? '',
          email: c.email ?? '',
          direccion: c.direccion ?? '',
          codigo_postal: c.codigo_postal ?? '',
          lista_precio_id: c.lista_precio_id,
          limite_credito: c.limite_credito ?? '',
          saldo: c.saldo,
          suspendido: c.suspendido,
          activo: c.activo,
          creado_en: c.creado_en,
        })),
      );

      // Resumen (txt) con totales
      const resumen = [
        '#TURISTEANDO — BACKUP TRANSACCIONAL',
        '====================================',
        '',
        `Rango: ${desde} → ${hasta}`,
        `Generado: ${new Date().toLocaleString('es-AR')}`,
        `Generado por: ${empleado?.nombre} ${empleado?.apellido} (${empleado?.email})`,
        '',
        '------ TOTALES ------',
        `Ventas: ${ventas.length}`,
        `  · completadas: ${ventas.filter((v) => v.estado === 'completada').length}`,
        `  · anuladas:    ${ventas.filter((v) => v.estado === 'anulada').length}`,
        `  · presupuestos:${ventas.filter((v) => v.estado === 'presupuesto').length}`,
        `Sesiones de caja: ${sesiones.length}`,
        `Movimientos de caja: ${movsCaja.length}`,
        `Movimientos de stock: ${movsStock.length}`,
        `Notas de crédito: ${notasCredito.length}`,
        `Clientes (snapshot total): ${clientes.length}`,
        '',
        '------ ARCHIVOS ------',
        'ventas.csv               — cabeceras de venta',
        'ventas_items.csv         — items detallados (1 fila por producto vendido)',
        'ventas_pagos.csv         — pagos (1 fila por método)',
        'sesiones_caja.csv        — aperturas/cierres de caja',
        'movimientos_caja.csv     — ingresos/egresos/cobros por sesión',
        'movimientos_stock.csv    — entradas/salidas/ajustes de stock',
        'notas_credito.csv        — cabeceras de NC',
        'notas_credito_items.csv  — items devueltos',
        'clientes.csv             — listado completo de clientes',
      ].join('\n');

      // Armar ZIP
      setProgreso('Comprimiendo ZIP…');
      const zip = new JSZip();
      zip.file('LEEME.txt', resumen);
      zip.file('ventas.csv', csvVentas);
      zip.file('ventas_items.csv', csvVentasItems);
      zip.file('ventas_pagos.csv', csvVentasPagos);
      zip.file('sesiones_caja.csv', csvSesionesCaja);
      zip.file('movimientos_caja.csv', csvMovsCaja);
      zip.file('movimientos_stock.csv', csvMovsStock);
      zip.file('notas_credito.csv', csvNotasCredito);
      zip.file('notas_credito_items.csv', csvNotasCreditoItems);
      zip.file('clientes.csv', csvClientes);

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // Descargar
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `turisteando-backup_${desde}_${hasta}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      toast.success(`Backup generado · ${ventas.length} ventas, ${sesiones.length} sesiones`);
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
          Descargá un archivo <code>.zip</code> con todos los movimientos del rango elegido.
          Sirve como respaldo, para auditoría o para llevar a un contador.
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
            stock, notas de crédito y snapshot de clientes.
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
            {generando ? progreso || 'Generando…' : 'Descargar backup (.zip)'}
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileArchive className="h-4 w-4" />
            ¿Qué incluye el ZIP?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="space-y-1.5 text-muted-foreground">
            <li>
              <b className="text-foreground">ventas.csv</b> — cabecera de cada venta (fecha,
              número, totales, estado)
            </li>
            <li>
              <b className="text-foreground">ventas_items.csv</b> — productos vendidos por venta
            </li>
            <li>
              <b className="text-foreground">ventas_pagos.csv</b> — métodos de pago por venta
            </li>
            <li>
              <b className="text-foreground">sesiones_caja.csv</b> — apertura/cierre por caja y
              cajero
            </li>
            <li>
              <b className="text-foreground">movimientos_caja.csv</b> — todos los ingresos y
              egresos
            </li>
            <li>
              <b className="text-foreground">movimientos_stock.csv</b> — altas, bajas, ajustes
              de stock
            </li>
            <li>
              <b className="text-foreground">notas_credito.csv</b> +{' '}
              <b className="text-foreground">notas_credito_items.csv</b>
            </li>
            <li>
              <b className="text-foreground">clientes.csv</b> — listado completo (snapshot al
              momento)
            </li>
            <li>
              <b className="text-foreground">LEEME.txt</b> — resumen con totales y descripción
              de cada archivo
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
