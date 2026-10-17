import { BadgePercent, Bike, LayoutGrid, ListChecks, MessageCircle, Settings, type LucideIcon } from 'lucide-react';

export type AppSection = 'chats' | 'servicios' | 'ofertas' | 'delivery' | 'tareas' | 'ajustes';

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
  { id: 'ofertas', to: '/app/ofertas', label: 'Ofertas', icon: BadgePercent },
  { id: 'delivery', to: '/app/pedidos', label: 'Delivery', icon: Bike },
  { id: 'tareas', to: '/app/tareas', label: 'Tareas', icon: ListChecks },
  { id: 'ajustes', to: '/app/ajustes', label: 'Ajustes', icon: Settings },
];

/** Barra inferior del celular: Tareas y Ajustes quedan en el menú del perfil (el avatar del encabezado). */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.id !== 'tareas' && item.id !== 'ajustes');

/** Sección a la que pertenece una ruta. */
export function sectionOf(pathname: string): AppSection {
  if (pathname.startsWith('/app/servicios')) return 'servicios';
  if (pathname.startsWith('/app/ofertas')) return 'ofertas';
  if (pathname.startsWith('/app/pedidos')) return 'delivery';
  if (pathname.startsWith('/app/tareas')) return 'tareas';
  if (pathname.startsWith('/app/ajustes')) return 'ajustes';
  return 'chats';
}
