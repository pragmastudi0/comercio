'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Button } from '@comercio/ui/button';
import { Badge } from '@comercio/ui/badge';
import { AbmDialogFooter, AbmSimple } from '@/components/abm-simple';
import type { Categoria } from '@comercio/db';

type AtributoDef = {
  clave: string;
  tipo: 'string' | 'number' | 'boolean' | 'enum';
  opciones?: string[];
};

export default function CategoriasPage() {
  const db = getDb();
  const qc = useQueryClient();
  const categoriasQ = useQuery({ queryKey: ['categorias'], queryFn: () => db.categorias.list() });
  const productosQ = useQuery({ queryKey: ['productos-all'], queryFn: () => db.productos.list() });

  const crearMut = useMutation({
    mutationFn: (input: { nombre: string; atributos: Categoria['atributos'] }) =>
      db.categorias.create(input),
    onSuccess: () => {
      toast.success('Categoría creada');
      qc.invalidateQueries({ queryKey: ['categorias'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const editarMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Categoria>) =>
      db.categorias.update(id, patch),
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
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Categorías</h1>
        <p className="text-sm text-muted-foreground">
          Las categorías agrupan productos y definen atributos opcionales por tipo (color,
          talle, etc.).
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
            cell: (r) => {
              const cant = cantPorCat(r.id);
              if (cant === 0) {
                return <span className="text-sm text-muted-foreground">0</span>;
              }
              return (
                <Link
                  href={`/productos?categoria=${r.id}`}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  title="Ver los productos de esta categoría"
                >
                  {cant} →
                </Link>
              );
            },
          },
          {
            header: 'Atributos',
            cell: (r) =>
              r.atributos && Object.keys(r.atributos).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(r.atributos).map(([k, def]) => (
                    <Badge key={k} variant="secondary" className="text-[10px]">
                      {k} · {def.tipo}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
        ]}
        buildCreate={(close) => (
          <CategoriaForm
            onSubmit={(v) => {
              crearMut.mutate(v);
              close();
            }}
            onCancel={close}
          />
        )}
        buildEdit={(row, close) => (
          <CategoriaForm
            initialNombre={row.nombre}
            initialAtributos={row.atributos}
            onSubmit={(v) => {
              editarMut.mutate({ id: row.id, ...v });
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
  initialNombre = '',
  initialAtributos,
  onSubmit,
  onCancel,
}: {
  initialNombre?: string;
  initialAtributos?: Categoria['atributos'];
  onSubmit: (v: { nombre: string; atributos: Categoria['atributos'] }) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initialNombre);
  const [attrs, setAttrs] = useState<AtributoDef[]>(
    initialAtributos
      ? Object.entries(initialAtributos).map(([clave, def]) => ({
          clave,
          tipo: def.tipo,
          opciones: def.opciones,
        }))
      : [],
  );

  function setAttr(idx: number, patch: Partial<AtributoDef>) {
    setAttrs(attrs.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }
  function addAttr() {
    setAttrs([...attrs, { clave: '', tipo: 'string' }]);
  }
  function delAttr(idx: number) {
    setAttrs(attrs.filter((_, i) => i !== idx));
  }

  function submit() {
    if (!nombre.trim()) return;
    // Validar claves únicas no vacías
    const claves = attrs.map((a) => a.clave.trim()).filter(Boolean);
    if (new Set(claves).size !== claves.length) {
      alert('Las claves de los atributos deben ser únicas');
      return;
    }
    const atributos: Categoria['atributos'] = {};
    for (const a of attrs) {
      const k = a.clave.trim();
      if (!k) continue;
      atributos[k] =
        a.tipo === 'enum'
          ? {
              tipo: 'enum',
              opciones: (a.opciones ?? []).map((o) => o.trim()).filter(Boolean),
            }
          : { tipo: a.tipo };
    }
    onSubmit({
      nombre: nombre.trim(),
      atributos: Object.keys(atributos).length ? atributos : undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1 block">Nombre</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-sm">Atributos por producto (opcional)</Label>
          <Button type="button" variant="outline" size="sm" onClick={addAttr}>
            <Plus className="mr-1 h-3 w-3" />
            Agregar atributo
          </Button>
        </div>
        {attrs.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Sin atributos. Sirven para que cada producto de esta categoría tenga campos
            extra (ej: <em>talle</em>, <em>color</em>, <em>peso</em>).
          </p>
        ) : (
          <div className="space-y-2">
            {attrs.map((a, i) => (
              <div key={i} className="rounded-md border p-2">
                <div className="grid grid-cols-[1fr_140px_auto] gap-2">
                  <div>
                    <Label className="mb-1 block text-[10px] uppercase text-muted-foreground">
                      Clave
                    </Label>
                    <Input
                      value={a.clave}
                      onChange={(e) =>
                        setAttr(i, { clave: e.target.value.replace(/\s+/g, '_').toLowerCase() })
                      }
                      placeholder="talle"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-[10px] uppercase text-muted-foreground">
                      Tipo
                    </Label>
                    <select
                      value={a.tipo}
                      onChange={(e) =>
                        setAttr(i, { tipo: e.target.value as AtributoDef['tipo'] })
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="string">Texto</option>
                      <option value="number">Número</option>
                      <option value="boolean">Sí/No</option>
                      <option value="enum">Opciones</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => delAttr(i)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {a.tipo === 'enum' && (
                  <div className="mt-2">
                    <Label className="mb-1 block text-[10px] uppercase text-muted-foreground">
                      Opciones (separadas por coma)
                    </Label>
                    <Input
                      value={(a.opciones ?? []).join(', ')}
                      onChange={(e) =>
                        setAttr(i, { opciones: e.target.value.split(',').map((s) => s.trim()) })
                      }
                      placeholder="rojo, azul, negro"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AbmDialogFooter onCancel={onCancel} onSubmit={submit} disabled={!nombre.trim()} />
    </div>
  );
}
