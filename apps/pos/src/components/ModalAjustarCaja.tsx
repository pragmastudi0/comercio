import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { Dialog, DialogHeader, DialogTitle } from '@comercio/ui/dialog';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Dialog de ajuste de caja durante la sesión. Crea un movimiento_caja
 * tipo 'ingreso' o 'egreso' en método efectivo. Sirve para:
 *  - Corregir error de apertura (la cajera puso $10k pero eran $8k).
 *  - Cargar más plata si hace falta cambio.
 *  - Sacar plata por algún motivo durante el turno.
 *
 * El movimiento queda registrado con el motivo para auditoría. NO toca
 * el `saldo_inicial` de la sesión — la diferencia aparece como
 * movimiento explícito en el cierre.
 */
export function ModalAjustarCaja({ open, onOpenChange }: Props) {
  const db = getDb();
  const qc = useQueryClient();
  const sesion = useSesion((s) => s.sesionCaja);
  const empleado = useSesion((s) => s.empleado);

  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');

  const ajustarMut = useMutation({
    mutationFn: async () => {
      if (!sesion || !empleado) throw new Error('Sin sesión activa');
      const n = parseFloat(monto);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Monto inválido');
      if (!motivo.trim()) throw new Error('Indicá un motivo');
      await db.sesionesCaja.registrarMovimiento({
        sesion_caja_id: sesion.id,
        tipo,
        metodo: 'efectivo',
        monto: n,
        empleado_id: empleado.id,
        motivo: motivo.trim(),
      });
    },
    onSuccess: () => {
      const signo = tipo === 'ingreso' ? '+' : '−';
      toast.success(`Caja ajustada: ${signo}$${parseFloat(monto).toLocaleString('es-AR')}`);
      qc.invalidateQueries({ queryKey: ['movimientos-sesion', sesion?.id] });
      // Reset y cerrar
      setMonto('');
      setMotivo('');
      setTipo('ingreso');
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogHeader>
        <DialogTitle>Ajustar efectivo de caja</DialogTitle>
        <p className="text-xs text-muted-foreground">
          Crea un movimiento de caja. Sirve para corregir errores de apertura
          o registrar entradas/salidas de plata durante el turno. Queda en
          auditoría con tu nombre y el motivo.
        </p>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo('ingreso')}
            className={`flex items-center justify-center gap-2 rounded-md border p-3 text-sm font-medium transition ${
              tipo === 'ingreso'
                ? 'border-green-600 bg-green-50 text-green-800'
                : 'border-input hover:bg-accent'
            }`}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Ingreso (sumar)
          </button>
          <button
            type="button"
            onClick={() => setTipo('egreso')}
            className={`flex items-center justify-center gap-2 rounded-md border p-3 text-sm font-medium transition ${
              tipo === 'egreso'
                ? 'border-orange-600 bg-orange-50 text-orange-800'
                : 'border-input hover:bg-accent'
            }`}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Egreso (restar)
          </button>
        </div>

        <div>
          <Label className="mb-1 block text-sm">Monto</Label>
          <Input
            type="number"
            step="100"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="0"
            className="text-right text-lg"
            autoFocus
          />
        </div>

        <div>
          <Label className="mb-1 block text-sm">Motivo</Label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              tipo === 'ingreso'
                ? 'Ej: Corrección saldo apertura, cambio chico'
                : 'Ej: Pago proveedor, sacar para cambio, etc.'
            }
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={ajustarMut.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => ajustarMut.mutate()}
            disabled={ajustarMut.isPending || !monto || !motivo.trim()}
          >
            {ajustarMut.isPending ? 'Guardando…' : 'Confirmar ajuste'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
