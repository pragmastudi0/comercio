import { Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { AbrirCaja } from './pages/AbrirCaja';
import { Caja } from './pages/Caja';
import { CerrarCaja } from './pages/CerrarCaja';
import { Historial } from './pages/Historial';
import { Ticket } from './pages/Ticket';
import { Reset } from './pages/Reset';
import { RequireEmpleado, RequireSesionAbierta } from './components/RequireSesion';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/abrir-caja"
        element={
          <RequireEmpleado>
            <AbrirCaja />
          </RequireEmpleado>
        }
      />
      <Route
        path="/caja"
        element={
          <RequireSesionAbierta>
            <Caja />
          </RequireSesionAbierta>
        }
      />
      <Route
        path="/cerrar-caja"
        element={
          <RequireSesionAbierta>
            <CerrarCaja />
          </RequireSesionAbierta>
        }
      />
      <Route
        path="/historial"
        element={
          <RequireSesionAbierta>
            <Historial />
          </RequireSesionAbierta>
        }
      />
      <Route path="/ticket/:id" element={<Ticket />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
