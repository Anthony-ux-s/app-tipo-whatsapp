import { LayoutGrid, ListChecks, MessageCircle, Settings, type LucideIcon } from 'lucide-react';

export type AppSection = 'chats' | 'servicios' | 'tareas' | 'ajustes';

export interface NavItem {
  id: AppSection;
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Secciones de Parla, en el orden de la barra (como WeChat: chats y servicios en la misma app). */
export const NAV_ITEMS: NavItem[] = [
  { id: 'chats', to: '/app', label: 'Chats', icon: MessageCircle },
  { id: 'servicios', to: '/app/servicios', label: 'Servicios', icon: LayoutGrid },
  { id: 'tareas', to: '/app/tareas', label: 'Tareas', icon: ListChecks },
  { id: 'ajustes', to: '/app/ajustes', label: 'Ajustes', icon: Settings },
];

/** Sección a la que pertenece una ruta (los pedidos viven dentro de Servicios). */
export function sectionOf(pathname: string): AppSection {
  if (pathname.startsWith('/app/servicios') || pathname.startsWith('/app/pedidos')) return 'servicios';
  if (pathname.startsWith('/app/tareas')) return 'tareas';
  if (pathname.startsWith('/app/ajustes')) return 'ajustes';
  return 'chats';
}
