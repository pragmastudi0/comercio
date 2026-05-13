'use client';

import { useState } from 'react';
import type { Producto } from '@comercio/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';

export type ProductoFormValues = {
  codigo_interno: string;
  nombre: string;
  descripcion: string;
  descripcion_larga: string;
  categoria_id: string;
  proveedor_id: string;
  costo: number;
  publicado_web: boolean;
  activo: boolean;
};

export function productoToForm(p: Producto): ProductoFormValues {
  return {
    codigo_interno: p.codigo_interno,
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    descripcion_larga: p.descripcion_larga ?? '',
    categoria_id: p.categoria_id,
    proveedor_id: p.proveedor_id ?? '',
    costo: p.costo,
    publicado_web: p.publicado_web,
    activo: p.activo,
  };
}

export function ProductoFormFields({
  values,
  onChange,
  categorias,
  proveedores,
}: {
  values: ProductoFormValues;
  onChange: (next: ProductoFormValues) => void;
  categorias: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
}) {
  function set<K extends keyof ProductoFormValues>(key: K, v: ProductoFormValues[K]) {
    onChange({ ...values, [key]: v });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del producto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block">Código interno (4–5 dígitos)</Label>
            <Input
              value={values.codigo_interno}
              onChange={(e) => set('codigo_interno', e.target.value.replace(/\D/g, ''))}
              maxLength={5}
              placeholder="1234"
              required
            />
          </div>
          <div>
            <Label className="mb-1 block">Costo</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={values.costo}
              onChange={(e) => set('costo', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 block">Nombre</Label>
          <Input
            value={values.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            placeholder="Producto"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block">Categoría</Label>
            <select
              value={values.categoria_id}
              onChange={(e) => set('categoria_id', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              <option value="">— Elegir —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block">Proveedor (opcional)</Label>
            <select
              value={values.proveedor_id}
              onChange={(e) => set('proveedor_id', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Ninguno —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label className="mb-1 block">Descripción corta</Label>
          <Input
            value={values.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
            placeholder="Resumen breve, aparece en el catálogo"
          />
        </div>
        <div>
          <Label className="mb-1 block">Descripción larga (para e-commerce)</Label>
          <textarea
            value={values.descripcion_larga}
            onChange={(e) => set('descripcion_larga', e.target.value)}
            placeholder="Detalle completo, usado en la ficha online cuando se publique"
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.activo}
              onChange={(e) => set('activo', e.target.checked)}
              className="h-4 w-4"
            />
            Activo (visible en el catálogo y en caja)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.publicado_web}
              onChange={(e) => set('publicado_web', e.target.checked)}
              className="h-4 w-4"
            />
            Publicado en e-commerce (futuro)
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

export function PreciosFields({
  precios,
  onChange,
  listas,
}: {
  precios: { listaId: string; escalas: { desde: number; precio: number }[] }[];
  onChange: (
    next: { listaId: string; escalas: { desde: number; precio: number }[] }[],
  ) => void;
  listas: { id: string; nombre: string }[];
}) {
  function setEscala(listaId: string, idx: number, patch: Partial<{ desde: number; precio: number }>) {
    onChange(
      precios.map((p) =>
        p.listaId === listaId
          ? {
              ...p,
              escalas: p.escalas.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
            }
          : p,
      ),
    );
  }
  function agregarEscala(listaId: string) {
    onChange(
      precios.map((p) =>
        p.listaId === listaId
          ? { ...p, escalas: [...p.escalas, { desde: (p.escalas.at(-1)?.desde ?? 0) + 1, precio: 0 }] }
          : p,
      ),
    );
  }
  function quitarEscala(listaId: string, idx: number) {
    onChange(
      precios.map((p) =>
        p.listaId === listaId
          ? { ...p, escalas: p.escalas.filter((_, i) => i !== idx) }
          : p,
      ),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Precios por lista</CardTitle>
        <p className="text-sm text-muted-foreground">
          Definí precios por cantidad. La primera escala "desde 1" se usa por defecto.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {listas.map((lista) => {
          const p = precios.find((x) => x.listaId === lista.id);
          if (!p) return null;
          return (
            <div key={lista.id}>
              <div className="mb-2 text-sm font-semibold">{lista.nombre}</div>
              {p.escalas.map((esc, idx) => (
                <div key={idx} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <div>
                    <Label className="mb-1 block text-xs">Desde cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      value={esc.desde}
                      onChange={(e) =>
                        setEscala(lista.id, idx, { desde: parseInt(e.target.value) || 1 })
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Precio</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={esc.precio}
                      onChange={(e) =>
                        setEscala(lista.id, idx, { precio: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    {idx > 0 ? (
                      <button
                        type="button"
                        onClick={() => quitarEscala(lista.id, idx)}
                        className="h-10 px-3 text-xs text-destructive hover:underline"
                      >
                        Quitar
                      </button>
                    ) : (
                      <span className="h-10" />
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => agregarEscala(lista.id)}
                className="text-xs text-primary hover:underline"
              >
                + Agregar escala por cantidad
              </button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function useProductoForm(initial?: ProductoFormValues) {
  return useState<ProductoFormValues>(
    initial ?? {
      codigo_interno: '',
      nombre: '',
      descripcion: '',
      descripcion_larga: '',
      categoria_id: '',
      proveedor_id: '',
      costo: 0,
      publicado_web: false,
      activo: true,
    },
  );
}
