'use client';

import { Info } from 'lucide-react';

/**
 * Ícono ℹ chiquito con tooltip nativo del browser. Se muestra al hacer
 * hover. Pensado para acompañar labels de campos que no se explican
 * solos ("Descuento propio", "Escalas por cantidad", etc.).
 *
 * Uso: <Label>Descuento propio <InfoTip text="Explicación..." /></Label>
 */
export function InfoTip({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      title={text}
      className={`inline-flex cursor-help items-center align-text-bottom text-slate-400 hover:text-slate-700 ${className}`}
      aria-label={text}
    >
      <Info className="h-3 w-3" />
    </span>
  );
}
