import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { setBrandName } from '@comercio/business';
import App from './App';
import '@comercio/ui/styles';

// Permite overridear el nombre del comercio desde env de Vite, para armar
// instancias demo / multi-tenant sin tocar código. Debe correr antes del
// primer render.
const brandEnv = (import.meta.env.VITE_BRAND_NAME ?? '').trim();
if (brandEnv) setBrandName(brandEnv);

// Tamaño de fuente base del PoS un poco más grande que el default web.
// Pedido del cliente: hay cajeros con visión cansada y el sistema se usa
// muchas horas seguidas. Aumentamos a 17px (default web es 16px); como
// Tailwind usa rem, todo el árbol escala parejo.
if (typeof document !== 'undefined') {
  document.documentElement.style.fontSize = '17px';
}

// === Limpieza de assets de versiones anteriores ===
// Borrar localStorage de la vesión v1 (que tenía residuo del modo mock).
try {
  localStorage.removeItem('turisteando-pos-sesion');
} catch {
  /* navegador con storage bloqueado */
}

// Forzar update de cualquier service worker viejo que esté sirviendo bundle
// stale. skipWaiting + clientsClaim del nuevo SW se encarga del resto.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.update())))
    .catch(() => {});
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No #root in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
