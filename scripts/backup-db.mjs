#!/usr/bin/env node
/**
 * Backup automatizado de la base de datos de Supabase → Google Drive.
 *
 * Corre desde GitHub Actions (cron diario). Hace 3 cosas:
 *   1) pg_dump de toda la BD (schema + data)
 *   2) Comprime con gzip
 *   3) Sube el archivo a una carpeta de Google Drive vía Service Account
 *   4) Elimina backups viejos manteniendo los últimos N (default 30)
 *
 * Variables de entorno requeridas:
 *   - SUPABASE_DB_URL       String de conexión postgres://... (settings > database)
 *   - GDRIVE_CREDENTIALS    JSON del service account de Google Cloud
 *   - GDRIVE_FOLDER_ID      ID de la carpeta de Drive donde se guardan
 *   - RETENTION_COUNT       (opcional) cuántos backups mantener, default 30
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, statSync, createReadStream } from 'node:fs';
import { google } from 'googleapis';

const {
  SUPABASE_DB_URL,
  GDRIVE_CREDENTIALS,
  GDRIVE_FOLDER_ID,
  RETENTION_COUNT = '30',
} = process.env;

if (!SUPABASE_DB_URL || !GDRIVE_CREDENTIALS || !GDRIVE_FOLDER_ID) {
  console.error(
    'Faltan variables: SUPABASE_DB_URL, GDRIVE_CREDENTIALS y/o GDRIVE_FOLDER_ID',
  );
  process.exit(1);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace(/T/, '_')
  .slice(0, 19);
const filename = `turisteando_${timestamp}.sql.gz`;
const localPath = `/tmp/${filename}`;

function log(msg) {
  console.log(`[backup] ${msg}`);
}

// 1) pg_dump + gzip en un solo pipeline
log('Dumping base de datos...');
try {
  execFileSync('bash', [
    '-c',
    // --no-owner y --no-privileges: el dump se puede restaurar en otra
    // instancia sin depender de los roles/usuarios originales de Supabase.
    // --clean --if-exists: al restaurar, dropea antes lo que exista.
    // -Fc no lo uso: prefiero SQL plano comprimido para poder inspeccionarlo.
    `pg_dump "${SUPABASE_DB_URL}" --no-owner --no-privileges --clean --if-exists | gzip -9 > "${localPath}"`,
  ], { stdio: 'inherit' });
} catch (err) {
  console.error('[backup] Falló pg_dump:', err.message);
  process.exit(1);
}

const sizeMB = (statSync(localPath).size / 1024 / 1024).toFixed(2);
log(`Dump listo: ${filename} (${sizeMB} MB)`);

// 2) Autenticación Google Drive con service account
const credentials = JSON.parse(GDRIVE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// 3) Subir archivo a Drive
log('Subiendo a Google Drive...');
const upload = await drive.files.create({
  requestBody: {
    name: filename,
    parents: [GDRIVE_FOLDER_ID],
  },
  media: {
    mimeType: 'application/gzip',
    body: createReadStream(localPath),
  },
  fields: 'id, name, size, webViewLink',
});
log(`Subido OK: ${upload.data.name} (id: ${upload.data.id})`);

// Limpiar tmp
unlinkSync(localPath);

// 4) Rotación: mantener solo los N más recientes
log('Aplicando retención...');
const list = await drive.files.list({
  q: `'${GDRIVE_FOLDER_ID}' in parents and name contains 'turisteando_' and trashed = false`,
  orderBy: 'createdTime desc',
  pageSize: 1000,
  fields: 'files(id, name, createdTime)',
});

const keep = parseInt(RETENTION_COUNT, 10);
const files = list.data.files ?? [];
log(`Backups en carpeta: ${files.length}. Retención: ${keep}.`);

const toDelete = files.slice(keep);
for (const f of toDelete) {
  await drive.files.delete({ fileId: f.id });
  log(`Borrado backup viejo: ${f.name}`);
}

log(`Terminado. Últimos ${Math.min(files.length, keep)} backups conservados.`);
