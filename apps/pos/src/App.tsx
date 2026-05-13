import { Link, Route, Routes } from 'react-router-dom';
import { Caja } from './pages/Caja';
import { Inicio } from './pages/Inicio';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="text-lg font-semibold">
            PoS · Comercio
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className="hover:underline">
              Inicio
            </Link>
            <Link to="/caja" className="hover:underline">
              Caja
            </Link>
          </nav>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/caja" element={<Caja />} />
      </Routes>
    </div>
  );
}
