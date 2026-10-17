import type { AuthHighlight, DemoAccount } from '../types/auth.types';

export const DEMO_PASSWORD = 'Parla2026!';

/** Cuentas de prueba creadas por el seed (se muestran solo para la demo). */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { identifier: 'laura', name: 'Laura Méndez', role: 'Grupos, tareas y pedidos', color: 'teal' },
  { identifier: 'andres', name: 'Andrés Rojas', role: 'Para chatear con Laura', color: 'emerald' },
  { identifier: '+573001234567', name: 'Sofía Ramírez', role: 'Entra con su teléfono', color: 'emerald-dark' },
];

export const AUTH_HIGHLIGHTS: AuthHighlight[] = [
  { title: 'Cifrado de extremo a extremo', text: 'Solo quienes están en el chat pueden leer los mensajes. Ni siquiera nuestro servidor.' },
  { title: 'Servicios sin salir del chat', text: 'Haz el mercado, paga con QR y recibe tu pedido con delivery.' },
  { title: 'Historial sin límite', text: 'Nada de borrar conversaciones a los 90 días.' },
];
