'use client';

import { Info } from 'lucide-react';

/**
 * Ícono ℹ con tooltip CSS propio (no usa el `title` nativo del browser
 * que tiene delay de ~1s y a veces no aparece). El tooltip se muestra
 * instantáneo al hover, con fondo oscuro y ancho fijo para wrapear
 * textos largos.
 *
 * Uso: <Label>Descuento propio <InfoTip text="Explicación..." /></Label>
 */
export function InfoTip({
  text,
  className = '',
  align = 'left',
}: {
  text: string;
  className?: string;
  /** Dónde alinear el popover respecto al ícono. */
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
        className={`pointer-events-none absolute top-full z-50 mt-1 hidden w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg group-hover:block ${alignClass}`}
      >
        {text}
      </span>
    </span>
  );
}
