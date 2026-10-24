import { BarChart3, Bike, Dices, LifeBuoy, Package, Route, Store, Ticket, Users, type LucideIcon } from 'lucide-react';
import type { AdminTab } from '../hooks/use-admin.hook';

export interface AdminNavItem {
  id: AdminTab;
  label: string;
  hint: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/** Secciones del panel de soporte, agrupadas como en el menú lateral. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Resumen',
    items: [
      { id: 'pedidos', label: 'Pedidos', hint: 'Todos los pedidos y su estado', icon: Package },
      { id: 'trafico', label: 'Tráfico', hint: 'Actividad y números del día', icon: BarChart3 },
    ],
  },
  {
    label: 'Personas',
    items: [
      { id: 'personas', label: 'Personas', hint: 'Usuarios, negocios y roles', icon: Users },
      { id: 'repartidores', label: 'Repartidores', hint: 'Revisar y aprobar altas', icon: Bike },
    ],
  },
  {
    label: 'Comercio',
    items: [
      { id: 'tiendas', label: 'Tiendas', hint: 'Revisar y aprobar tiendas', icon: Store },
      { id: 'tarifas', label: 'Tarifas', hint: 'Precios y reparto del delivery', icon: Route },
      { id: 'cupones', label: 'Cupones', hint: 'Descuentos y promociones', icon: Ticket },
      { id: 'marketing', label: 'Marketing', hint: 'Ruletas, rascas, cofres y ofertas', icon: Dices },
    ],
  },
  {
    label: 'Soporte',
    items: [{ id: 'reclamos', label: 'Reclamos', hint: 'Devoluciones y casos abiertos', icon: LifeBuoy }],
  },
];

export const ADMIN_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap((group) => group.items);

export const ADMIN_TABS: readonly AdminTab[] = ADMIN_ITEMS.map((item) => item.id);

export const DEFAULT_ADMIN_TAB: AdminTab = 'pedidos';
