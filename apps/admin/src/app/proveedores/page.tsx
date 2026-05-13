'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Badge } from '@comercio/ui/badge';
import { AbmDialogFooter, AbmSimple } from '@/components/abm-simple';
import type { Proveedor } from '@comercio/db';

export default function ProveedoresPage() {
  const db = getDb();
  const qc = useQueryClient();
  const provQ = useQuery({ queryKey: ['proveedores-admin'], queryFn: () => db.proveedores.list() });
  const productosQ = useQuery({ queryKey: ['productos-all'], queryFn: () => db.productos.list() });

  const crearMut = useMutation({
    mutationFn: (v: Omit<Proveedor, 'id'>) => db.proveedores.create(v),
    onSuccess: () => {
      toast.success('Proveedor creado');
      qc.invalidateQueries({ queryKey: ['proveedores-admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const editarMut = useMutation({
    mutationFn: ({ id, ...v }: { id: string } & Partial<Proveedor>) =>
      db.proveedores.update(id, v),
    onSuccess: () => {
      toast.success('Proveedor editado');
      qc.invalidateQueries({ queryKey: ['proveedores-admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const eliminarMut = useMutation({
    mutationFn: (id: string) => db.proveedores.delete(id),
    onSuccess: () => {
      toast.success('Proveedor eliminado');
      qc.invalidateQueries({ queryKey: ['proveedores-admin'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cantProductos = (id: string) =>
    (productosQ.data ?? []).filter((p) => p.proveedor_id === id).length;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
      </div>

      <AbmSimple<Proveedor>
        titulo="Proveedores"
        rows={provQ.data ?? []}
        loading={provQ.isLoading}
        newButtonLabel="Nuevo proveedor"
        columns={[
          { header: 'Nombre', cell: (r) => <span className="font-medium">{r.nombre}</span> },
          { header: 'CUIT', cell: (r) => r.cuit ?? <span className="text-muted-foreground">—</span> },
          { header: 'Teléfono', cell: (r) => r.telefono ?? '—' },
          { header: 'Email', cell: (r) => r.email ?? '—' },
          {
            header: 'Productos',
            cell: (r) => <span className="text-muted-foreground">{cantProductos(r.id)}</span>,
          },
          {
            header: 'Estado',
            cell: (r) =>
              r.activo ? (
                <Badge variant="secondary">Activo</Badge>
              ) : (
                <Badge variant="destructive">Inactivo</Badge>
              ),
          },
        ]}
        buildCreate={(close) => (
          <ProveedorForm
            onSubmit={(v) => {
              crearMut.mutate(v);
              close();
            }}
            onCancel={close}
          />
        )}
        buildEdit={(row, close) => (
          <ProveedorForm
            initial={row}
            onSubmit={(v) => {
              editarMut.mutate({ id: row.id, ...v });
              close();
            }}
            onCancel={close}
          />
        )}
        canDelete={(r) => {
          const cant = cantProductos(r.id);
          if (cant > 0) return `No se puede eliminar: ${cant} producto(s) lo tienen asignado`;
          return true;
        }}
        onDelete={(r) => eliminarMut.mutateAsync(r.id)}
      />
    </div>
  );
}

function ProveedorForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Proveedor;
  onSubmit: (v: Omit<Proveedor, 'id'>) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [cuit, setCuit] = useState(initial?.cuit ?? '');
  const [telefono, setTelefono] = useState(initial?.telefono ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [contacto, setContacto] = useState(initial?.contacto ?? '');
  const [activo, setActivo] = useState(initial?.activo ?? true);

  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1 block">Nombre</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1 block">CUIT</Label>
          <Input value={cuit} onChange={(e) => setCuit(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 block">Teléfono</Label>
          <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1 block">Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 block">Contacto</Label>
          <Input value={contacto} onChange={(e) => setContacto(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="h-4 w-4"
        />
        Activo
      </label>
      <AbmDialogFooter
        onCancel={onCancel}
        onSubmit={() =>
          nombre.trim() &&
          onSubmit({
            nombre: nombre.trim(),
            cuit: cuit.trim() || undefined,
            telefono: telefono.trim() || undefined,
            email: email.trim() || undefined,
            contacto: contacto.trim() || undefined,
            activo,
          })
        }
        disabled={!nombre.trim()}
      />
    </div>
  );
}
