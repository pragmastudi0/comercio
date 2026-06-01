'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';
import { BRAND } from '@comercio/business';
import { getDb } from '@/lib/db';
import { useSesion } from '@/stores/sesion';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Input } from '@comercio/ui/input';
import { Label } from '@comercio/ui/label';
import { Button } from '@comercio/ui/button';

export default function LoginPage() {
  const db = getDb();
  const router = useRouter();
  const setEmpleado = useSesion((s) => s.setEmpleado);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMut = useMutation({
    mutationFn: async () => {
      const emp = await db.empleados.autenticar(email.trim(), password);
      if (!emp) throw new Error('Email o contraseña incorrectos');
      return emp;
    },
    onSuccess: (emp) => {
      setEmpleado(emp);
      toast.success(`Bienvenido ${emp.nombre}`);
      router.push('/');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="container mx-auto max-w-md px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{BRAND.nombreCorto}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Panel de administración</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Iniciar sesión
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loginMut.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="email" className="mb-1 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@turisteando.local"
                required
              />
            </div>
            <div>
              <Label htmlFor="password" className="mb-1 block">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loginMut.isPending}>
              {loginMut.isPending ? 'Verificando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Solo personal autorizado. Si olvidaste tu contraseña, hablalo con el dueño.
      </p>
    </main>
  );
}
