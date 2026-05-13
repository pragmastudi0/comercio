'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDb } from '@/lib/db';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { AbmDialogFooter, AbmSimple } from '@/components/abm-simple';
import type { Categoria } from '@comercio/db';

export default function CategoriasPage() {
  const db = getDb();
  const qc = useQueryClient();
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const productosQ = useQuery({ queryKey: ['productos-all'], queryFn: () => db.productos.list() });

  const crearMut = useMutation({
    mutationFn: (nombre: string) => db.categorias.create({ nombre }),
    onSuccess: () => {
      toast.success('Categoría creada');
      qc.invalidateQueries({ queryKey: ['categorias'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const editarMut = useMutation({
    mutationFn: ({ id, nombre }: { id: string; nombre: string }) =>
      db.categorias.update(id, { nombre }),
    onSuccess: () => {
      toast.success('Categoría editada');
      qc.invalidateQueries({ queryKey: ['categorias'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const eliminarMut = useMutation({
    mutationFn: (id: string) => db.categorias.delete(id),
    onSuccess: () => {
      toast.success('Categoría eliminada');
      qc.invalidateQueries({ queryKey: ['categorias'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cantPorCat = (id: string) =>
    (productosQ.data ?? []).filter((p) => p.categoria_id === id).length;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        <p className="text-sm text-muted-foreground">
          Las categorías agrupan productos. Próximamente: atributos dinámicos por categoría.
        </p>
      </div>

      <AbmSimple<Categoria>
        titulo="Categorías"
        rows={categoriasQ.data ?? []}
        loading={categoriasQ.isLoading}
        newButtonLabel="Nueva categoría"
        columns={[
          { header: 'Nombre', cell: (r) => <span className="font-medium">{r.nombre}</span> },
          {
            header: 'Productos',
            cell: (r) => (
              <span className="text-sm text-muted-foreground">{cantPorCat(r.id)}</span>
            ),
          },
        ]}
        buildCreate={(close) => <CategoriaForm onSubmit={(n) => { crearMut.mutate(n); close(); }} onCancel={close} />}
        buildEdit={(row, close) => (
          <CategoriaForm
            initial={row.nombre}
            onSubmit={(n) => {
              editarMut.mutate({ id: row.id, nombre: n });
              close();
            }}
            onCancel={close}
          />
        )}
        canDelete={(r) => {
          const cant = cantPorCat(r.id);
          if (cant > 0) return `No se puede eliminar: ${cant} producto(s) usan esta categoría`;
          return true;
        }}
        onDelete={(r) => eliminarMut.mutateAsync(r.id)}
        emptyMessage="No hay categorías. Creá la primera con el botón de arriba."
      />
    </div>
  );
}

function CategoriaForm({
  initial = '',
  onSubmit,
  onCancel,
}: {
  initial?: string;
  onSubmit: (nombre: string) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initial);
  return (
    <>
      <Label className="mb-1 block">Nombre</Label>
      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      <AbmDialogFooter onCancel={onCancel} onSubmit={() => nombre.trim() && onSubmit(nombre.trim())} disabled={!nombre.trim()} />
    </>
  );
}
