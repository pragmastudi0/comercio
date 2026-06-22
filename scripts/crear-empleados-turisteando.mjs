#!/usr/bin/env node
// Script idempotente para crear/actualizar los empleados reales de
// Turisteando en Supabase (Auth + tabla `empleados`).
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/crear-empleados-turisteando.mjs
//
// O si ya tenés esas vars en `apps/admin/.env.local` con los nombres
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (no los NEXT_PUBLIC_), el
// script las lee automáticamente.
//
// Qué hace por cada empleado:
//   1) Si NO existe en Supabase Auth → lo crea con email_confirm=true.
//      Si existe → le actualiza la password.
//   2) Si NO existe fila en `empleados` con ese email → la inserta con
//      el rol indicado, `activo=true`, `auth_user_id` lincado.
//      Si existe → actualiza rol, nombre, apellido y la reactiva.
//
// Volver a correrlo es seguro: solo cambia passwords y campos.

// `@supabase/supabase-js` está instalada como dep de `packages/db` (no en
// la raíz del monorepo), así que para evitar el ERR_MODULE_NOT_FOUND
// cuando se corre desde `scripts/` lo resolvemos con createRequire
// apuntando a un archivo que SÍ esté en un workspace que tenga la dep.
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

// ---------- Cargar env vars desde apps/admin/.env.local si existen ----------
function cargarEnvLocal() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidato = resolve(here, '..', 'apps', 'admin', '.env.local');
  if (!existsSync(candidato)) return;
  const raw = readFileSync(candidato, 'utf8');
  for (const linea of raw.split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k]) continue; // No pisar lo que ya está en env.
    const v = vRaw.replace(/^["']|["']$/g, '');
    process.env[k] = v;
  }
}
cargarEnvLocal();

const SUPABASE_URL_RAW =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL_RAW || !SERVICE_ROLE) {
  console.error(
    '✗ Faltan env vars. Necesito SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
  );
  console.error('  Exportalas o ponelas en apps/admin/.env.local.');
  process.exit(1);
}

// Defensa contra pegar la URL "completa" del API (ej. con /rest/v1/ al
// final). El cliente de supabase-js quiere solo el host raíz.
const SUPABASE_URL = SUPABASE_URL_RAW.replace(/\/rest\/v1\/?$/i, '').replace(
  /\/+$/,
  '',
);
if (SUPABASE_URL !== SUPABASE_URL_RAW) {
  console.log(`ℹ Normalizada la URL: ${SUPABASE_URL_RAW} → ${SUPABASE_URL}\n`);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- IDs preset alineados con migrations/0001 ----------
const EMPRESA_ID = '00000000-0000-0000-0000-000000000001';
const ROL_ENCARGADO = '00000000-0000-0000-0000-000000000011';
const ROL_CAJERO = '00000000-0000-0000-0000-000000000012';

// ---------- Empleados reales del cliente ----------
// Password: primer nombre en minúscula + últimos 4 dígitos del DNI.
// Cada uno la recuerda fácil y es distinta por persona.
const EMPLEADOS = [
  {
    nombre: 'Susana Elizabet Ramona',
    apellido: 'Barón',
    email: 'eli.susana.baron@gmail.com',
    password: 'susana6418',
    rol_id: ROL_CAJERO,
  },
  {
    nombre: 'Gregorio',
    apellido: 'Icikson',
    email: 'gregorioicikson@gmail.com',
    password: 'gregorio4106',
    rol_id: ROL_ENCARGADO,
  },
  {
    nombre: 'Virginia Agostina',
    apellido: 'Enrique',
    email: 'virginiaagostinaenrique@gmail.com',
    password: 'virginia9267',
    rol_id: ROL_ENCARGADO,
  },
  {
    nombre: 'Agustina Victoria',
    apellido: 'Paez Guardatti',
    email: 'agusvickypaez@gmail.com',
    password: 'agustina8143',
    rol_id: ROL_CAJERO,
  },
  {
    nombre: 'Franco Nicolás',
    apellido: 'Narváez',
    email: 'ciruelavarela2015@gmail.com',
    password: 'franco4405',
    rol_id: ROL_CAJERO,
  },
  {
    nombre: 'Diego Emanuel',
    apellido: 'Rodríguez',
    email: 'diez13sep@gmail.com',
    password: 'diego0670',
    rol_id: ROL_ENCARGADO,
  },
];

// ---------- Helpers ----------
async function buscarUsuarioEnAuth(email) {
  // listUsers pagina; con 6 empleados nos sobra la primera página.
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw new Error(`auth.listUsers: ${error.message}`);
  return data.users.find(
    (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
  );
}

async function crearOActualizar(emp) {
  // 1) Auth
  const yaAuth = await buscarUsuarioEnAuth(emp.email);
  let authUserId;
  if (yaAuth) {
    const { error } = await admin.auth.admin.updateUserById(yaAuth.id, {
      password: emp.password,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`auth.updateUserById ${emp.email}: ${error.message}`);
    }
    authUserId = yaAuth.id;
    console.log(`  ✓ Auth existente · password actualizada`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: emp.email,
      password: emp.password,
      email_confirm: true,
    });
    if (error) throw new Error(`auth.createUser ${emp.email}: ${error.message}`);
    authUserId = data.user.id;
    console.log(`  ✓ Auth creado nuevo`);
  }

  // 2) Tabla empleados (lookup case-insensitive por email)
  const { data: existente, error: selErr } = await admin
    .from('empleados')
    .select('id')
    .ilike('email', emp.email)
    .maybeSingle();
  if (selErr) throw new Error(`empleados.select ${emp.email}: ${selErr.message}`);

  if (existente) {
    const { error } = await admin
      .from('empleados')
      .update({
        nombre: emp.nombre,
        apellido: emp.apellido,
        rol_id: emp.rol_id,
        auth_user_id: authUserId,
        activo: true,
      })
      .eq('id', existente.id);
    if (error) {
      throw new Error(`empleados.update ${emp.email}: ${error.message}`);
    }
    console.log(`  ✓ Fila empleados actualizada (rol asignado, activo)`);
  } else {
    const { error } = await admin.from('empleados').insert({
      empresa_id: EMPRESA_ID,
      nombre: emp.nombre,
      apellido: emp.apellido,
      email: emp.email,
      rol_id: emp.rol_id,
      auth_user_id: authUserId,
      activo: true,
      // local_id / deposito_id quedan en null — los cajeros eligen caja
      // (y depósito asociado) al loguearse en el PoS.
    });
    if (error) {
      throw new Error(`empleados.insert ${emp.email}: ${error.message}`);
    }
    console.log(`  ✓ Fila empleados insertada`);
  }
}

// ---------- Main ----------
async function main() {
  console.log('Creando/actualizando empleados de Turisteando…\n');
  const errores = [];
  for (const emp of EMPLEADOS) {
    console.log(`→ ${emp.email}`);
    try {
      await crearOActualizar(emp);
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      errores.push({ emp, msg: e.message });
    }
  }

  console.log('\n────────────────────────────────────────────────');
  console.log('  Credenciales — para entregar a cada empleado');
  console.log('────────────────────────────────────────────────');
  for (const e of EMPLEADOS) {
    const rol = e.rol_id === ROL_ENCARGADO ? 'Encargado' : 'Cajero';
    console.log(`\n  ${e.nombre} ${e.apellido} · ${rol}`);
    console.log(`    Email:    ${e.email}`);
    console.log(`    Password: ${e.password}`);
  }
  console.log('\n────────────────────────────────────────────────');
  console.log('  Recordatorios');
  console.log('────────────────────────────────────────────────');
  console.log('  • Los cajeros entran SOLO al PoS. Si intentan entrar al');
  console.log('    admin, el sistema los desloguea con un mensaje.');
  console.log('  • Encargados (Gregorio, Virginia, Diego) entran al');
  console.log('    admin y al PoS.');
  console.log('  • Agus sigue siendo el único Admin (rol dueño).');
  console.log('  • Cada uno puede cambiar su password desde el PoS o el');
  console.log('    admin después del primer login.');

  if (errores.length > 0) {
    console.log(`\n✗ ${errores.length} con errores — revisar arriba.`);
    process.exit(1);
  }
  console.log('\n✓ Listo, todo aplicado.');
}

main().catch((e) => {
  console.error('✗ Falla inesperada:', e);
  process.exit(1);
});
