'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Badge } from '@comercio/ui/badge';
import { AbmDialogFooter, AbmSimple } from '@/components/abm-simple';
import type { ListaPrecio } from '@comercio/db';

export default function ListasPrecioPage() {
  const db = getDb();
  const qc = useQueryClient();
  const listasQ = useQuery({
    queryKey: ['listas-precio'],
    queryFn: () => db.listasPrecio.list(),
  });

  const crearMut = useMutation({
    mutationFn: (input: { nombre: string; default: boolean; activa: boolean }) =>
      db.listasPrecio.create(input),
    onSuccess: () => {
      toast.success('Lista creada');
      qc.invalidateQueries({ queryKey: ['listas-precio'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const editarMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<ListaPrecio>) =>
      db.listasPrecio.update(id, patch),
    onSuccess: () => {
      toast.success('Lista actualizada');
      qc.invalidateQueries({ queryKey: ['listas-precio'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const eliminarMut = useMutation({
    mutationFn: (id: string) => db.listasPrecio.delete(id),
    onSuccess: () => {
      toast.success('Lista eliminada');
      qc.invalidateQueries({ queryKey: ['listas-precio'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Listas de precio</h1>
        <p className="text-sm text-muted-foreground">
          Definí listas (Consumidor final, Mayorista, etc.). Cada producto puede tener un precio
          distinto por lista y escalas por cantidad.
        </p>
      </div>

      <AbmSimple<ListaPrecio>
        titulo="Listas"
        rows={listasQ.data ?? []}
        loading={listasQ.isLoading}
        newButtonLabel="Nueva lista"
        columns={[
          { header: 'Nombre', cell: (r) => <span className="font-medium">{r.nombre}</span> },
          {
            header: 'Default',
            cell: (r) => r.default && <Badge variant="secondary">default</Badge>,
          },
          {
            header: 'Estado',
            cell: (r) =>
              r.activa ? (
                <Badge variant="secondary">Activa</Badge>
              ) : (
                <Badge variant="destructive">Inactiva</Badge>
              ),
          },
        ]}
        buildCreate={(close) => (
          <ListaForm
            onSubmit={(v) => {
              crearMut.mutate(v);
              close();
            }}
            onCancel={close}
          />
        )}
        buildEdit={(row, close) => (
          <ListaForm
            initial={row}
            onSubmit={(v) => {
              editarMut.mutate({ id: row.id, ...v });
              close();
            }}
            onCancel={close}
          />
        )}
        onDelete={(r) => eliminarMut.mutateAsync(r.id)}
      />
    </div>
  );
}

function ListaForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: ListaPrecio;
  onSubmit: (v: { nombre: string; default: boolean; activa: boolean }) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [esDefault, setEsDefault] = useState(initial?.default ?? false);
  const [activa, setActiva] = useState(initial?.activa ?? true);
  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1 block">Nombre</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={esDefault}
          onChange={(e) => setEsDefault(e.target.checked)}
          className="h-4 w-4"
        />
        Default (la usada por consumidor final)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={activa}
          onChange={(e) => setActiva(e.target.checked)}
          className="h-4 w-4"
        />
        Activa
      </label>
      <AbmDialogFooter
        onCancel={onCancel}
        onSubmit={() => nombre.trim() && onSubmit({ nombre: nombre.trim(), default: esDefault, activa })}
        disabled={!nombre.trim()}
      />
    </div>
  );
}
