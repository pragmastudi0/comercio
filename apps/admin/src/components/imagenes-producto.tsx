'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Button } from '@comercio/ui/button';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Skeleton } from '@comercio/ui/skeleton';

const MAX_IMAGENES = 3;

/**
 * Gestor de imágenes de un producto. Por ahora soporta URLs externas
 * (Google Drive, imgur, etc). Cuando configuremos Supabase Storage,
 * sumamos un botón "Subir desde la PC" al lado.
 */
export function ImagenesProducto({ productoId }: { productoId: string }) {
  const db = getDb();
  const qc = useQueryClient();
  const [nuevaUrl, setNuevaUrl] = useState('');

  const imagenesQ = useQuery({
    queryKey: ['imagenes', productoId],
    queryFn: () => db.productos.imagenes(productoId),
  });

  const agregarMut = useMutation({
    mutationFn: (url: string) => db.productos.agregarImagen(productoId, url.trim()),
    onSuccess: () => {
      toast.success('Imagen agregada');
      setNuevaUrl('');
      qc.invalidateQueries({ queryKey: ['imagenes', productoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminarMut = useMutation({
    mutationFn: (id: string) => db.productos.eliminarImagen(id),
    onSuccess: () => {
      toast.success('Imagen eliminada');
      qc.invalidateQueries({ queryKey: ['imagenes', productoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const imagenes = imagenesQ.data ?? [];
  const lleno = imagenes.length >= MAX_IMAGENES;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4" />
          Imágenes del producto
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hasta {MAX_IMAGENES} imágenes. Se muestran en el e-commerce. La primera es la
          principal.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {imagenesQ.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {imagenes.map((img, i) => (
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-md border bg-muted/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={`Imagen ${i + 1}`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = '0.3';
                  }}
                />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-background">
                    Principal
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('¿Eliminar esta imagen?')) eliminarMut.mutate(img.id);
                  }}
                  className="absolute right-1.5 top-1.5 rounded-full bg-background/95 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {/* Placeholder vacíos para visualizar los espacios disponibles */}
            {Array.from({
              length: Math.max(0, MAX_IMAGENES - imagenes.length),
            }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-muted/10 text-muted-foreground"
              >
                <ImageIcon className="h-6 w-6 opacity-40" />
              </div>
            ))}
          </div>
        )}

        <div>
          <Label htmlFor="img-url" className="mb-1 block text-xs">
            Agregar imagen por URL
          </Label>
          <div className="flex gap-2">
            <Input
              id="img-url"
              type="url"
              placeholder="https://..."
              value={nuevaUrl}
              onChange={(e) => setNuevaUrl(e.target.value)}
              disabled={lleno}
            />
            <Button
              type="button"
              onClick={() => {
                if (!nuevaUrl.trim()) return;
                if (!/^https?:\/\//i.test(nuevaUrl.trim())) {
                  toast.error('La URL debe empezar con http:// o https://');
                  return;
                }
                agregarMut.mutate(nuevaUrl);
              }}
              disabled={lleno || !nuevaUrl.trim() || agregarMut.isPending}
            >
              <Plus className="mr-1 h-4 w-4" />
              Agregar
            </Button>
          </div>
          {lleno && (
            <p className="mt-1 text-xs text-muted-foreground">
              Alcanzaste el máximo de {MAX_IMAGENES} imágenes. Eliminá una para sumar otra.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
