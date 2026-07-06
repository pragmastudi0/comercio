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
 * true si el empleado logueado es un dev con acceso a las acciones de
 * corrección (editar sesión de caja, forzar cierre). Se matchea por
 * email exacto, case-insensitive. Devuelve false si el empleado es
 * null/undefined o si el email no está en la whitelist.
 */
export function esPragmaDev(empleado: { email?: string } | null | undefined): boolean {
  if (!empleado?.email) return false;
  const norm = empleado.email.trim().toLowerCase();
  return PRAGMA_DEV_EMAILS.some((e) => e.toLowerCase() === norm);
}
