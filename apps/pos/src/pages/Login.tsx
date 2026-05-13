import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '@/stores/sesion';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@comercio/ui/card';
import { Skeleton } from '@comercio/ui/skeleton';
import { Badge } from '@comercio/ui/badge';
import { User } from 'lucide-react';

export function Login() {
  const db = getDb();
  const navigate = useNavigate();
  const setEmpleado = useSesion((s) => s.setEmpleado);

  const empleadosQ = useQuery({
    queryKey: ['empleados-pos'],
    queryFn: () => db.empleados.list({ activo: true }),
  });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: () => db.roles.list() });

  function seleccionar(empleadoId: string) {
    const empleado = (empleadosQ.data ?? []).find((e) => e.id === empleadoId);
    if (!empleado) return;
    setEmpleado(empleado);
    navigate('/abrir-caja');
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Comercio · PoS</h1>
        <p className="mt-2 text-muted-foreground">Elegí tu usuario para empezar el turno</p>
      </div>

      {empleadosQ.isLoading || rolesQ.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="grid gap-3">
          {(empleadosQ.data ?? []).map((emp) => {
            const rol = rolesQ.data?.find((r) => r.id === emp.rol_id);
            return (
              <button
                key={emp.id}
                onClick={() => seleccionar(emp.id)}
                className="text-left transition hover:scale-[1.01]"
              >
                <Card className="hover:border-primary">
                  <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                    <div className="rounded-full bg-primary/10 p-3">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {emp.nombre} {emp.apellido}
                      </CardTitle>
                      <CardDescription>{emp.email}</CardDescription>
                    </div>
                    {rol && <Badge variant="secondary">{rol.nombre}</Badge>}
                  </CardHeader>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Demo con datos en memoria. En producción cada cajero entra con su email + contraseña.
      </p>
    </main>
  );
}
