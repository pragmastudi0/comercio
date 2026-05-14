import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ScrollText, Receipt } from 'lucide-react';
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
    refetchInterval: 5000,
  });

  const ventas = (ventasQ.data ?? []).slice().reverse();
  const totalDia = (ventasQ.data ?? []).reduce((acc, v) => acc + v.total, 0);
  const cantidad = (ventasQ.data ?? []).length;

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <div className="border-b bg-background p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <ScrollText className="h-3 w-3" />
          Tus ventas del turno
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">
          {formatCurrency(totalDia)}
        </div>
        <div className="text-xs text-muted-foreground">{cantidad} ventas · refresh c/5s</div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-xs">
        {ventas.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground">
            Sin ventas todavía.
            <br />
            Empezá la primera con F2.
          </p>
        ) : (
          ventas.map((v) => {
            const hora = new Date(v.fecha).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const metodosUnicos = Array.from(new Set(v.pagos.map((p) => p.metodo)));
            const esMixto = metodosUnicos.length > 1;
            const metodos = esMixto
              ? `Mixto · ${metodosUnicos.map((m) => m.replace('_', ' ')).join(' + ')}`
              : metodosUnicos[0]?.replace('_', ' ') ?? '';
            return (
              <Link
                key={v.id}
                to={`/ticket/${v.id}`}
                className="block rounded px-2 py-2 transition hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-mono text-muted-foreground">
                    <Receipt className="h-3 w-3" />
                    {v.numero}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(v.total)}
                  </span>
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                  <span>{hora}</span>
                  <span className="capitalize">{metodos}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
