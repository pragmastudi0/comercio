#!/usr/bin/env node
// =============================================================
// Aplica MÁXIMO(C11, B12) al costo y precio CF de los productos
// que tienen diferencia entre los dos Excel de origen.
// =============================================================
//
// Por default corre en DRY-RUN: te muestra qué haría, genera los
// backups y NO toca la BD. Para aplicar de verdad:
//   node scripts/aplicar-max-precios.mjs --apply
//
// Backups generados ANTES de tocar nada:
//   ~/Downloads/BACKUP-PRECIOS-antes-<timestamp>.xlsx
//     — cada fila es 1 producto que se va a modificar, con costo y
//       precio ANTES (los que están en Supabase ahora) y DESPUÉS
//       (el máximo que se va a aplicar). Humano legible.
//   ~/Downloads/ROLLBACK-PRECIOS-<timestamp>.sql
//     — script SQL con los UPDATE inversos. Si algo sale mal, lo
//       pegás en Supabase SQL Editor y volvés al estado anterior.
//
// Uso:
//   node scripts/aplicar-max-precios.mjs           # dry-run
//   node scripts/aplicar-max-precios.mjs --apply   # aplica
//
// Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en
// apps/admin/.env.local (mismo mecanismo que importar-stock.mjs).
// Y los Excel del cliente en ~/Downloads/ARTICULOS.xlsx y
// ~/Downloads/ARTICULOS b12.xlsx.
// =============================================================

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __here = dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(
  resolve(__here, '..', 'packages', 'db', 'package.json'),
);
const supabaseModulePath = requireFromDb.resolve('@supabase/supabase-js');
const { createClient } = await import(supabaseModulePath);

const APPLY = process.argv.includes('--apply');

// ── env local ─────────────────────────────────────────────────
function cargarEnvLocal() {
  const candidato = resolve(__here, '..', 'apps', 'admin', '.env.local');
  if (!existsSync(candidato)) return;
  const raw = readFileSync(candidato, 'utf8');
  for (const linea of raw.split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k]) continue;
    process.env[k] = vRaw.replace(/^["']|["']$/g, '');
  }
}
cargarEnvLocal();

const SUPABASE_URL = (
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('✗ Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en apps/admin/.env.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const LISTA_CF = '00000000-0000-0000-0000-000000000020';

// ── leer los 2 excel via python (openpyxl ya lo usamos así antes) ──
console.log('▸ Leyendo Excels del cliente…');
const pyScript = `
import openpyxl, json, sys
def num(v):
  if v is None or v == '': return None
  if isinstance(v, (int, float)): return float(v)
  try: return float(str(v).replace(',', '.').strip())
  except: return None
def cargar(path):
  wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
  ws = wb.active
  header = list(next(ws.iter_rows(values_only=True)))
  col = {name: i for i, name in enumerate(header)}
  out = {}
  for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0: continue
    cod = row[col['Codigo_interno']]
    if cod is None: continue
    out[str(cod).strip()] = {
      'nombre': str(row[col['Nombre']] or ''),
      'costo': num(row[col['Costo_unidad']]) or 0,
      'precio': num(row[col['Precio_VTA1']]) or 0,
    }
  wb.close()
  return out
c11 = cargar('/Users/gon/Downloads/ARTICULOS.xlsx')
b12 = cargar('/Users/gon/Downloads/ARTICULOS b12.xlsx')
print(json.dumps({'c11': c11, 'b12': b12}))
`;
const pyOut = execSync(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});
const { c11, b12 } = JSON.parse(pyOut);

// Detectar productos con diferencia + calcular el máximo
const objetivos = []; // { codigo, nombre, max_costo, max_precio }
for (const cod of Object.keys(c11)) {
  if (!(cod in b12)) continue;
  const a = c11[cod];
  const b = b12[cod];
  const difCosto = Math.abs(a.costo - b.costo) > 0.01;
  const difPrecio = Math.abs(a.precio - b.precio) > 0.01;
  if (!difCosto && !difPrecio) continue;
  objetivos.push({
    codigo: cod,
    nombre: a.nombre,
    max_costo: Math.max(a.costo, b.costo),
    max_precio: Math.max(a.precio, b.precio),
  });
}
console.log(`✓ ${objetivos.length} productos con diferencia entre C11 y B12`);

// ── cargar estado ACTUAL desde Supabase ────────────────────────
console.log('▸ Cargando estado actual de Supabase (productos + precios CF)…');
const codigos = objetivos.map((o) => o.codigo);
// Paginado porque IN de 1000+ ids puede reventar
async function fetchProductosPorCodigos(codigos) {
  const CHUNK = 500;
  const acc = [];
  for (let i = 0; i < codigos.length; i += CHUNK) {
    const slice = codigos.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from('productos')
      .select('id, codigo_interno, nombre, costo')
      .in('codigo_interno', slice);
    if (error) throw new Error(`productos.list: ${error.message}`);
    acc.push(...data);
  }
  return acc;
}
const productos = await fetchProductosPorCodigos(codigos);
const prodPorCodigo = new Map(productos.map((p) => [p.codigo_interno, p]));

async function fetchPreciosCF(ids) {
  const CHUNK = 500;
  const acc = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from('producto_lista_precio')
      .select('producto_id, escalas')
      .eq('lista_precio_id', LISTA_CF)
      .in('producto_id', slice);
    if (error) throw new Error(`precios.list: ${error.message}`);
    acc.push(...data);
  }
  return acc;
}
const precios = await fetchPreciosCF(productos.map((p) => p.id));
const precioPorProdId = new Map(precios.map((p) => [p.producto_id, p]));

// Construir "plan": lo que vamos a cambiar
const plan = [];
for (const o of objetivos) {
  const prod = prodPorCodigo.get(o.codigo);
  if (!prod) continue;
  const pr = precioPorProdId.get(prod.id);
  const precioActual = pr?.escalas?.[0]?.precio ?? 0;
  const costoActual = Number(prod.costo);
  const cambiaCosto = Math.abs(costoActual - o.max_costo) > 0.01;
  const cambiaPrecio = Math.abs(precioActual - o.max_precio) > 0.01;
  if (!cambiaCosto && !cambiaPrecio) continue; // ya está en el máximo
  plan.push({
    id: prod.id,
    codigo: o.codigo,
    nombre: prod.nombre ?? o.nombre,
    costoActual,
    costoNuevo: cambiaCosto ? o.max_costo : costoActual,
    precioActual,
    precioNuevo: cambiaPrecio ? o.max_precio : precioActual,
    cambiaCosto,
    cambiaPrecio,
    tienePrecioRow: !!pr,
  });
}
console.log(`✓ Plan: ${plan.length} productos van a cambiar de valor`);
console.log(`  - Costo cambia en: ${plan.filter((p) => p.cambiaCosto).length}`);
console.log(`  - Precio cambia en: ${plan.filter((p) => p.cambiaPrecio).length}`);

// ── generar backups ──────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const HOME = process.env.HOME ?? '/tmp';

// 1. SQL rollback (por si hay que revertir después)
const sqlLines = [
  `-- ROLLBACK de aplicar-max-precios.mjs`,
  `-- Generado: ${new Date().toISOString()}`,
  `-- Productos afectados: ${plan.length}`,
  `-- Pegá esto en Supabase SQL Editor si tenés que revertir.`,
  `begin;`,
];
for (const p of plan) {
  if (p.cambiaCosto) {
    sqlLines.push(
      `update productos set costo = ${p.costoActual} where id = '${p.id}';  -- ${p.codigo} ${p.nombre.slice(0, 40)}`,
    );
  }
  if (p.cambiaPrecio && p.tienePrecioRow) {
    sqlLines.push(
      `update producto_lista_precio set escalas = '[{"desde":1,"precio":${p.precioActual}}]'::jsonb where producto_id = '${p.id}' and lista_precio_id = '${LISTA_CF}';`,
    );
  }
}
sqlLines.push(`commit;`);
const sqlPath = `${HOME}/Downloads/ROLLBACK-PRECIOS-${ts}.sql`;
writeFileSync(sqlPath, sqlLines.join('\n'));
console.log(`✓ Rollback SQL: ${sqlPath}`);

// 2. Excel humano legible
console.log(`▸ Generando Excel backup humano legible…`);
const pyExcel = `
import openpyxl, json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
plan = json.loads(sys.stdin.read())
wb = Workbook()
ws = wb.active
ws.title = 'Cambios'
ws.append(['Código', 'Nombre', 'Costo ANTES', 'Costo DESPUÉS', 'Δ costo', 'Precio ANTES', 'Precio DESPUÉS', 'Δ precio'])
for c in range(1, 9):
  ws.cell(row=1, column=c).font = Font(bold=True)
  ws.cell(row=1, column=c).alignment = Alignment(horizontal='center')
for p in plan:
  ws.append([
    p['codigo'], p['nombre'],
    p['costoActual'], p['costoNuevo'], p['costoNuevo'] - p['costoActual'],
    p['precioActual'], p['precioNuevo'], p['precioNuevo'] - p['precioActual'],
  ])
widths = [10, 55, 12, 12, 10, 12, 12, 10]
from openpyxl.utils import get_column_letter
for i, w in enumerate(widths, 1):
  ws.column_dimensions[get_column_letter(i)].width = w
for r in range(2, len(plan) + 2):
  for c in [3, 4, 5, 6, 7, 8]:
    ws.cell(row=r, column=c).number_format = '#,##0'
ws.freeze_panes = 'A2'
wb.save(sys.argv[1])
`;
const xlsxPath = `${HOME}/Downloads/BACKUP-PRECIOS-antes-${ts}.xlsx`;
execSync(`python3 -c "${pyExcel.replace(/"/g, '\\"')}" "${xlsxPath}"`, {
  input: JSON.stringify(plan),
  encoding: 'utf8',
});
console.log(`✓ Excel backup: ${xlsxPath}`);

if (!APPLY) {
  console.log('\n━━━ DRY-RUN ━━━');
  console.log('NO se aplicó nada. Para aplicar de verdad:');
  console.log('  node scripts/aplicar-max-precios.mjs --apply');
  process.exit(0);
}

// ── aplicar ──────────────────────────────────────────────────
console.log('\n▸ Aplicando cambios en Supabase…');
let okCount = 0;
let failCount = 0;
for (const p of plan) {
  try {
    if (p.cambiaCosto) {
      const { error } = await admin
        .from('productos')
        .update({ costo: p.costoNuevo })
        .eq('id', p.id);
      if (error) throw error;
    }
    if (p.cambiaPrecio) {
      const escalas = [{ desde: 1, precio: p.precioNuevo }];
      if (p.tienePrecioRow) {
        const { error } = await admin
          .from('producto_lista_precio')
          .update({ escalas })
          .eq('producto_id', p.id)
          .eq('lista_precio_id', LISTA_CF);
        if (error) throw error;
      } else {
        const { error } = await admin
          .from('producto_lista_precio')
          .insert({ producto_id: p.id, lista_precio_id: LISTA_CF, escalas });
        if (error) throw error;
      }
    }
    okCount++;
    if (okCount % 50 === 0) {
      process.stdout.write(`  ${okCount}/${plan.length}\r`);
    }
  } catch (e) {
    failCount++;
    console.error(`  ✗ ${p.codigo} ${p.nombre.slice(0, 40)}: ${e.message}`);
  }
}
console.log(`\n━━━ Listo ━━━`);
console.log(`  Exitosos: ${okCount}`);
console.log(`  Con error: ${failCount}`);
console.log(`\nSi hay que revertir todo: pegá ${sqlPath} en Supabase SQL Editor.`);
