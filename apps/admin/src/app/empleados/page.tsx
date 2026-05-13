'use client';

import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@comercio/ui/table';
import { Badge } from '@comercio/ui/badge';
import { Skeleton } from '@comercio/ui/skeleton';

export default function EmpleadosPage() {
  const db = getDb();
  const empleadosQ = useQuery({ queryKey: ['empleados'], queryFn: () => db.empleados.list() });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: () => db.roles.list() });

  if (empleadosQ.isLoading || rolesQ.isLoading) {
    return (
      <main className="container mx-auto py-10">
        <Skeleton className="mb-4 h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }

  const empleados = empleadosQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const rolNombre = (id: string) => roles.find((r) => r.id === id)?.nombre ?? '—';

  return (
    <main className="container mx-auto py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Empleados</h1>
        <p className="text-sm text-muted-foreground">
          La matriz de permisos editable se construye en el día 3 (paso del prompt).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Override</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {empleados.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.nombre} {e.apellido}
                  </TableCell>
                  <TableCell>{e.email}</TableCell>
                  <TableCell>{rolNombre(e.rol_id)}</TableCell>
                  <TableCell>
                    {e.permisos_override ? (
                      <Badge>con override</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.activo ? (
                      <Badge variant="secondary">Activo</Badge>
                    ) : (
                      <Badge variant="destructive">Inactivo</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
