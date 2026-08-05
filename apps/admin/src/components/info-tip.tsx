'use client';

import { Info } from 'lucide-react';

/**
 * Ícono ℹ con tooltip CSS propio (no usa el `title` nativo del browser
 * que tiene delay de ~1s y a veces no aparece). El tooltip se muestra
 * instantáneo al hover, con fondo oscuro y ancho contenido.
 *
 * Ojo con `normal-case` y `normal-nums`: los labels donde suele vivir
 * este componente tienen `uppercase text-[10px]` y sin esto el tooltip
 * hereda esas clases y el texto queda ilegible en mayúsculas.
 *
 * Uso: <Label>Descuento propio <InfoTip text="Explicación..." /></Label>
 */
export function InfoTip({
  text,
  className = '',
  align = 'right',
}: {
  text: string;
  className?: string;
  /** Dónde ancla el popover respecto al ícono. Default 'right' porque los
   *  InfoTip suelen vivir en labels cerca del borde del panel — creciendo
   *  hacia la izquierda es más seguro. Cuando hay espacio a ambos lados,
   *  pasar 'center'. */
  align?: 'left' | 'right' | 'center';
}) {
  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0';
  return (
    <span
      className={`group relative inline-flex cursor-help items-center align-middle text-slate-500 hover:text-slate-800 ${className}`}
      aria-label={text}
    >
      <Info className="h-3.5 w-3.5" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-50 mt-1 hidden w-56 whitespace-normal break-words rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-hover:block ${alignClass}`}
      >
        {text}
      </span>
    </span>
  );
}
