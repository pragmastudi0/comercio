import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { formatCurrency } from '@comercio/ui/utils';

export function VentasDelDia() {
  const db = getDb();
  const empleado = useSesion((s) => s.empleado);
  const sesion = useSesion((s) => s.sesionCaja);

  const ventasQ = useQuery({
    queryKey: ['ventas-sesion', sesion?.id],
    queryFn: () =>
      sesion
        ? db.ventas.list({
            empleado_id: empleado?.id,
            desde: sesion.abierta_en,
            estado: 'completada',
          })
        : Promise.resolve([]),
    enabled: !!sesion,
    refetchInterval: 5000, // re-fetch cada 5s para reflejar nuevas ventas
  });

  const ventas = (ventasQ.data ?? []).slice().reverse().slice(0, 10);
  const totalDia = (ventasQ.data ?? []).reduce((acc, v) => acc + v.total, 0);
  const cantidad = (ventasQ.data ?? []).length;

  return (
    <div className="border-t bg-muted/20 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 font-medium text-muted-foreground">
          <ScrollText className="h-3 w-3" />
          Tu turno
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">{formatCurrency(totalDia)}</div>
          <div className="text-[10px] text-muted-foreground">{cantidad} ventas</div>
        </div>
      </div>
      {ventas.length === 0 ? (
        <p className="text-muted-foreground">Sin ventas todavía.</p>
      ) : (
        <div className="space-y-1">
          {ventas.map((v) => (
            <Link
              key={v.id}
              to={`/ticket/${v.id}`}
              className="flex items-center justify-between rounded px-2 py-1 hover:bg-accent"
            >
              <span className="font-mono text-[10px] text-muted-foreground">{v.numero}</span>
              <span className="tabular-nums">{formatCurrency(v.total)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
