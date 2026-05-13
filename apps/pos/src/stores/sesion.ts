import { create } from 'zustand';
import type { Caja, Empleado, SesionCaja } from '@comercio/db';

type SesionState = {
  empleado: Empleado | null;
  caja: Caja | null;
  sesionCaja: SesionCaja | null;
  setEmpleado: (e: Empleado | null) => void;
  setCaja: (c: Caja | null) => void;
  setSesionCaja: (s: SesionCaja | null) => void;
  logout: () => void;
};

export const useSesion = create<SesionState>((set) => ({
  empleado: null,
  caja: null,
  sesionCaja: null,
  setEmpleado: (empleado) => set({ empleado }),
  setCaja: (caja) => set({ caja }),
  setSesionCaja: (sesionCaja) => set({ sesionCaja }),
  logout: () => set({ empleado: null, caja: null, sesionCaja: null }),
}));
