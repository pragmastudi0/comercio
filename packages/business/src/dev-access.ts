// Backdoor de acceso para el desarrollador de Pragma. NO es un rol
// permanente del cliente — es un fallback fijo por email para poder
// entrar a corregir sesiones de caja rotas (empleado equivocado, caja
// del local equivocado, cajas que quedaron abiertas por olvido) sin
// depender de que Agus toque roles ni permisos.
//
// La lista es HARDCODEADA a propósito: es más seguro que un rol
// editable, porque nadie del cliente puede sumar mails acá sin abrir
// un PR. Si en el futuro entra otro dev, sumar su email a la constante
// y deployar.
export const PRAGMA_DEV_EMAILS: readonly string[] = [
  'pragmasolucionesdigitales@gmail.com',
];

/**
 * Super-admins: dueño(s) del negocio + dev de Pragma. Tienen bypass
 * total de permisos en el admin — cualquier `puede(...)` devuelve true.
 * Sirve para que Agus (dueño) no se quede afuera de acciones puntuales
 * como "editar código de producto" por un override mal seteado en BD,
 * y para que Pragma pueda entrar a corregir cosas siempre.
 *
 * NO se puede editar desde el cliente: cambios acá van por PR.
 */
export const SUPER_ADMIN_EMAILS: readonly string[] = [
  'agustinicikson@hotmail.com',
  'pragmasolucionesdigitales@gmail.com',
];

function emailEnLista(
  empleado: { email?: string } | null | undefined,
  lista: readonly string[],
): boolean {
  if (!empleado?.email) return false;
  const norm = empleado.email.trim().toLowerCase();
  return lista.some((e) => e.toLowerCase() === norm);
}

/**
 * true si el empleado logueado es un dev con acceso a las acciones de
 * corrección (editar sesión de caja, forzar cierre). Se matchea por
 * email exacto, case-insensitive. Devuelve false si el empleado es
 * null/undefined o si el email no está en la whitelist.
 */
export function esPragmaDev(empleado: { email?: string } | null | undefined): boolean {
  return emailEnLista(empleado, PRAGMA_DEV_EMAILS);
}

/**
 * true si el empleado es super-admin (dueño o dev). En el hook de
 * permisos del admin, cualquier `puede(...)` devuelve true si esto es
 * true, sin importar el rol ni el override guardado en BD.
 */
export function esSuperAdmin(empleado: { email?: string } | null | undefined): boolean {
  return emailEnLista(empleado, SUPER_ADMIN_EMAILS);
}
