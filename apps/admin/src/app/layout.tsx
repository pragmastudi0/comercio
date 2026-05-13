import type { Metadata } from 'next';
import { Providers } from './providers';
import '@comercio/ui/styles';

export const metadata: Metadata = {
  title: 'Comercio · Admin',
  description: 'Panel de gestión',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
