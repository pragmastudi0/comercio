import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';
import { BRAND } from '@comercio/business';
import { useSesion } from '@/stores/sesion';
import { getDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@comercio/ui/card';
import { Input } from '@comercio/ui/input';
import { PasswordInput } from '@comercio/ui/password-input';
import { Label } from '@comercio/ui/label';
import { Button } from '@comercio/ui/button';

export function Login() {
  const db = getDb();
  const navigate = useNavigate();
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
      toast.success(`Hola ${emp.nombre}`);
      navigate('/abrir-caja');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="container mx-auto max-w-md px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{BRAND.nombreCorto}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Iniciar turno
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
                placeholder="cajero@comercio.local"
                required
              />
            </div>
            <div>
              <Label htmlFor="password" className="mb-1 block">
                Contraseña
              </Label>
              <PasswordInput
                id="password"
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

    </main>
  );
}
