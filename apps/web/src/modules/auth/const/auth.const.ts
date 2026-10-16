import type { AuthHighlight, DemoAccount } from '../types/auth.types';

export const DEMO_PASSWORD = 'Parla2026!';

/** Cuentas de prueba creadas por el seed (se muestran solo para la demo). */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { identifier: 'laura', name: 'Laura Méndez', role: 'Administradora', color: 'teal' },
  { identifier: 'andres', name: 'Andrés Rojas', role: 'Colaborador', color: 'emerald' },
  { identifier: '+573001234567', name: 'Sofía Ramírez', role: 'Colaboradora · teléfono', color: 'emerald-dark' },
];

export const AUTH_HIGHLIGHTS: AuthHighlight[] = [
  { title: 'Cifrado de extremo a extremo', text: 'Solo tu equipo puede leer los mensajes. Ni siquiera nuestro servidor.' },
  { title: 'Separado de tu vida personal', text: 'Espacios de trabajo con canales, roles e invitaciones.' },
  { title: 'Historial sin límite', text: 'Nada de borrar conversaciones a los 90 días.' },
];
