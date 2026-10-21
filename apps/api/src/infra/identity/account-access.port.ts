/**
 * Acceso de cada cuenta en cada petición: si está suspendida y, de paso, registrar que abrió la app
 * (para el tráfico del panel de soporte).
 */
export interface AccountAccess {
  /** true si puede seguir; false si soporte la suspendió. Registra la visita del día. */
  allow(userId: string): Promise<boolean>;
  /** Olvida lo guardado de la cuenta (al suspenderla o reactivarla, para que se note al instante). */
  forget(userId: string): void;
}

export const ACCOUNT_ACCESS = Symbol('ACCOUNT_ACCESS');
