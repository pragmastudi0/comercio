#!/usr/bin/env node
// =============================================================
// Importador del inventario del B12 de Turisteando
// =============================================================
// Lee /tmp/articulos-b12.json (generado por la conversión del Excel
// de ARTICULOS.xlsx) y:
//
//   1. Crea categorías que no existen en Supabase.
//   2. Crea proveedores que no existen.
//   3. UPSERT de productos por codigo_interno (sobreescribe nombre,
//      costo, categoría, proveedor, activo, descripción).
//   4. Setea el stock de cada producto en el depósito B12.
//   5. Setea el precio en la lista Consumidor Final.
//   6. BORRA productos que están en Supabase pero NO en el Excel
//      (eran de prueba — confirmado por el cliente).
//
// Es idempotente: correrlo dos veces no genera duplicados.
//
// Uso:
//   export SUPABASE_URL=...
//   export SUPABASE_SERVICE_ROLE_KEY=...
//   node scripts/importar-stock-b12.mjs
// =============================================================

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __here = dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(
  resolve(__here, '..', 'packages', 'db', 'package.json'),
);
const supabaseModulePath = requireFromDb.resolve('@supabase/supabase-js');
const { createClient } = await import(supabaseModulePath);

// ── env / config ────────────────────────────────────────────────
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
)
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/+$/, '');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('✗ Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Constantes ──────────────────────────────────────────────────
const LISTA_CF = '00000000-0000-0000-0000-000000000020';
const NOMBRE_DEPOSITO_B12 = 'B12'; // busca depósito que CONTENGA "B12" en el nombre

// ── Cargar JSON ─────────────────────────────────────────────────
const JSON_PATH = '/tmp/articulos-b12.json';
if (!existsSync(JSON_PATH)) {
  console.error(`✗ No existe ${JSON_PATH}. Generalo primero con el script Python.`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
console.log(`✓ Cargados ${data.productos.length} productos del Excel.\n`);

// ── Resolver depósito B12 por nombre ────────────────────────────
async function resolverDeposito() {
  const { data: deps, error } = await admin
    .from('depositos')
    .select('id, nombre');
  if (error) throw new Error(`depositos.list: ${error.message}`);
  const match = deps.find((d) =>
    (d.nombre ?? '').toLowerCase().includes(NOMBRE_DEPOSITO_B12.toLowerCase()),
  );
  if (!match) {
    throw new Error(
      `No encontré un depósito con "${NOMBRE_DEPOSITO_B12}" en el nombre. ` +
        `Depósitos existentes: ${deps.map((d) => d.nombre).join(', ')}`,
    );
  }
  console.log(`✓ Depósito B12 resuelto: "${match.nombre}" (${match.id})\n`);
  return match.id;
}

// ── 1. Categorías ───────────────────────────────────────────────
async function upsertCategorias() {
  const { data: existentes, error } = await admin
    .from('categorias')
    .select('id, nombre');
  if (error) throw new Error(`categorias.list: ${error.message}`);
  const porNombre = new Map(
    existentes.map((c) => [c.nombre.toLowerCase(), c]),
  );

  let creadas = 0;
  const mapNombreId = new Map();

  for (const nombre of data.categorias) {
    const ya = porNombre.get(nombre.toLowerCase());
    if (ya) {
      mapNombreId.set(nombre, ya.id);
    } else {
      const { data: nueva, error: insErr } = await admin
        .from('categorias')
        .insert({ nombre, activa: true })
        .select('id')
        .single();
      if (insErr) throw new Error(`categorias.insert ${nombre}: ${insErr.message}`);
      mapNombreId.set(nombre, nueva.id);
      creadas++;
    }
  }
  console.log(
    `✓ Categorías: ${data.categorias.length} (${creadas} nuevas, ${data.categorias.length - creadas} ya existían).`,
  );
  return mapNombreId;
}

// ── 2. Proveedores ──────────────────────────────────────────────
async function upsertProveedores() {
  const { data: existentes, error } = await admin
    .from('proveedores')
    .select('id, nombre');
  if (error) throw new Error(`proveedores.list: ${error.message}`);
  const porNombre = new Map(
    existentes.map((p) => [p.nombre.toLowerCase(), p]),
  );

  let creados = 0;
  const mapNombreId = new Map();

  for (const nombre of data.proveedores) {
    const ya = porNombre.get(nombre.toLowerCase());
    if (ya) {
      mapNombreId.set(nombre, ya.id);
    } else {
      const { data: nuevo, error: insErr } = await admin
        .from('proveedores')
        .insert({ nombre, activo: true })
        .select('id')
        .single();
      if (insErr) {
        throw new Error(`proveedores.insert ${nombre}: ${insErr.message}`);
      }
      mapNombreId.set(nombre, nuevo.id);
      creados++;
    }
  }
  console.log(
    `✓ Proveedores: ${data.proveedores.length} (${creados} nuevos, ${data.proveedores.length - creados} ya existían).`,
  );
  return mapNombreId;
}

// ── 3. Productos (upsert por codigo_interno) ────────────────────
async function upsertProductos(catMap, provMap) {
  // Traer existentes para mapear codigo_interno → id
  const PAGE = 1000;
  const existentes = [];
  let from = 0;
  while (true) {
    const { data: chunk, error } = await admin
      .from('productos')
      .select('id, codigo_interno')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`productos.list: ${error.message}`);
    existentes.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  const porCodigo = new Map(existentes.map((p) => [p.codigo_interno, p.id]));
  const codigosExcel = new Set(data.productos.map((p) => p.codigo_interno));

  let actualizados = 0;
  let creados = 0;
  const mapCodigoId = new Map();

  for (const p of data.productos) {
    const yaId = porCodigo.get(p.codigo_interno);
    const payload = {
      codigo_interno: p.codigo_interno,
      nombre: p.nombre,
      categoria_id: catMap.get(p.categoria),
      proveedor_id: p.proveedor ? provMap.get(p.proveedor) : null,
      costo: p.costo,
      activo: p.activo,
      descripcion: p.descripcion ?? null,
      publicado_web: false,
    };

    if (yaId) {
      const { error } = await admin
        .from('productos')
        .update(payload)
        .eq('id', yaId);
      if (error) {
        throw new Error(`productos.update ${p.codigo_interno}: ${error.message}`);
      }
      mapCodigoId.set(p.codigo_interno, yaId);
      actualizados++;
    } else {
      const { data: nuevo, error } = await admin
        .from('productos')
        .insert(payload)
        .select('id')
        .single();
      if (error) {
        throw new Error(`productos.insert ${p.codigo_interno}: ${error.message}`);
      }
      mapCodigoId.set(p.codigo_interno, nuevo.id);
      creados++;
    }
    if ((actualizados + creados) % 200 === 0) {
      process.stdout.write(
        `  ...productos: ${actualizados + creados}/${data.productos.length}\r`,
      );
    }
  }
  console.log(
    `✓ Productos: ${data.productos.length} (${creados} nuevos, ${actualizados} actualizados).      `,
  );

  // 4. BORRAR los que están en Supabase pero NO en el Excel
  const huerfanos = existentes.filter((p) => !codigosExcel.has(p.codigo_interno));
  if (huerfanos.length > 0) {
    console.log(`  → Borrando ${huerfanos.length} productos huérfanos (eran pruebas)...`);
    for (const h of huerfanos) {
      // Limpiar dependencias antes del DELETE.
      // - precios y stock_items tienen on delete cascade → se borran solos
      // - movimientos_stock NO cascada — usamos DELETE chequeo: si tiene
      //   movimientos, no podemos borrar; lo desactivamos como fallback.
      const { error } = await admin
        .from('productos')
        .delete()
        .eq('id', h.id);
      if (error) {
        // Probablemente tiene movimientos. Desactivar como fallback.
        if (/foreign key|violates|23503/i.test(error.message)) {
          await admin
            .from('productos')
            .update({ activo: false })
            .eq('id', h.id);
        } else {
          throw new Error(`productos.delete ${h.codigo_interno}: ${error.message}`);
        }
      }
    }
    console.log(`  ✓ Huérfanos eliminados.`);
  }

  return mapCodigoId;
}

// ── 5. Stock en B12 ─────────────────────────────────────────────
async function importarStock(mapCodigoId, depositoB12) {
  // Traer stock_items existentes para SOLO el depósito B12.
  const PAGE = 1000;
  const existentes = [];
  let from = 0;
  while (true) {
    const { data: chunk, error } = await admin
      .from('stock_items')
      .select('producto_id, cantidad')
      .eq('deposito_id', depositoB12)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`stock_items.list: ${error.message}`);
    existentes.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  const existsByProd = new Set(existentes.map((s) => s.producto_id));

  let upd = 0;
  let ins = 0;

  for (const p of data.productos) {
    const prodId = mapCodigoId.get(p.codigo_interno);
    if (!prodId) continue;
    const fila = {
      producto_id: prodId,
      variante_id: null,
      deposito_id: depositoB12,
      cantidad: p.stock,
      minimo: p.stock_min ?? null,
    };
    if (existsByProd.has(prodId)) {
      const { error } = await admin
        .from('stock_items')
        .update({ cantidad: p.stock, minimo: p.stock_min ?? null })
        .eq('producto_id', prodId)
        .eq('deposito_id', depositoB12)
        .is('variante_id', null);
      if (error) {
        throw new Error(
          `stock.update ${p.codigo_interno}: ${error.message}`,
        );
      }
      upd++;
    } else {
      const { error } = await admin.from('stock_items').insert(fila);
      if (error) {
        throw new Error(
          `stock.insert ${p.codigo_interno}: ${error.message}`,
        );
      }
      ins++;
    }
    if ((upd + ins) % 200 === 0) {
      process.stdout.write(
        `  ...stock B12: ${upd + ins}/${data.productos.length}\r`,
      );
    }
  }
  console.log(`✓ Stock B12: ${ins} nuevos, ${upd} actualizados.       `);
}

// ── 6. Precios en lista CF ──────────────────────────────────────
async function importarPrecios(mapCodigoId) {
  // Traer precios existentes para la lista CF.
  const PAGE = 1000;
  const existentes = [];
  let from = 0;
  while (true) {
    const { data: chunk, error } = await admin
      .from('producto_lista_precio')
      .select('producto_id, escalas')
      .eq('lista_precio_id', LISTA_CF)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`precios.list: ${error.message}`);
    existentes.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  const existsByProd = new Set(existentes.map((p) => p.producto_id));

  let upd = 0;
  let ins = 0;

  for (const p of data.productos) {
    const prodId = mapCodigoId.get(p.codigo_interno);
    if (!prodId) continue;
    const escalas = [{ desde: 1, precio: p.precio_cf }];
    if (existsByProd.has(prodId)) {
      const { error } = await admin
        .from('producto_lista_precio')
        .update({ escalas })
        .eq('producto_id', prodId)
        .eq('lista_precio_id', LISTA_CF);
      if (error) {
        throw new Error(`precios.update ${p.codigo_interno}: ${error.message}`);
      }
      upd++;
    } else {
      const { error } = await admin.from('producto_lista_precio').insert({
        producto_id: prodId,
        lista_precio_id: LISTA_CF,
        escalas,
      });
      if (error) {
        throw new Error(`precios.insert ${p.codigo_interno}: ${error.message}`);
      }
      ins++;
    }
    if ((upd + ins) % 200 === 0) {
      process.stdout.write(
        `  ...precios CF: ${upd + ins}/${data.productos.length}\r`,
      );
    }
  }
  console.log(`✓ Precios CF: ${ins} nuevos, ${upd} actualizados.       `);
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('━━━ Importación inventario B12 ━━━\n');
  const depositoB12 = await resolverDeposito();
  const catMap = await upsertCategorias();
  const provMap = await upsertProveedores();
  const mapCodigoId = await upsertProductos(catMap, provMap);
  await importarStock(mapCodigoId, depositoB12);
  await importarPrecios(mapCodigoId);

  console.log('\n━━━ Listo ━━━');
  console.log(`Inventario B12 importado: ${data.productos.length} productos`);
  console.log('Andá a /admin/productos en el admin para verificar.');
  console.log('Andá a /admin/depositos para ver el stock consolidado.');
}

main().catch((e) => {
  console.error(`\n✗ Falla: ${e.message}`);
  process.exit(1);
});
