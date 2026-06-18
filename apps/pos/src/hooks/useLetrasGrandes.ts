import { useEffect, useState } from 'react';

/**
 * Modo "letras grandes" para cajeros con baja visión. El estado se guarda en
 * localStorage indexado por caja_id (así cada caja puede tener su propia
 * preferencia). Aplica un font-size mayor al `<html>` y todo el árbol escala
 * proporcionalmente porque Tailwind usa rem.
 */
const STORAGE_PREFIX = 'pos-letras-grandes';
const FONT_NORMAL = '16px';
const FONT_GRANDE = '19px';

function aplicarTamanio(grande: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = grande ? FONT_GRANDE : FONT_NORMAL;
}

export function useLetrasGrandes(cajaId: string | undefined) {
  const storageKey = cajaId ? `${STORAGE_PREFIX}-${cajaId}` : null;

  const [grande, setGrande] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !storageKey) return false;
    return window.localStorage.getItem(storageKey) === '1';
  });

  // Re-aplicar tamaño al montar y cuando cambia caja o estado.
  useEffect(() => {
    aplicarTamanio(grande);
    return () => {
      // Al salir de la pantalla de caja, restauramos tamaño normal.
      aplicarTamanio(false);
    };
  }, [grande]);

  function toggle() {
    if (!storageKey) return;
    const nuevo = !grande;
    setGrande(nuevo);
    window.localStorage.setItem(storageKey, nuevo ? '1' : '0');
  }

  return { grande, toggle };
}
