import { Link } from 'react-router';
import { MOBILE_NAV_ITEMS, type AppSection } from '../const/navigation.const';

interface MobileNavProps {
  section: AppSection;
  unread: number;
  activeOrders: number;
}

/** Color de cada pestaña: la burbuja cuando está activa y el ícono cuando no. */
const TONES: Partial<Record<AppSection, { on: string; off: string; text: string }>> = {
  chats: { on: 'bg-brand text-white shadow-[0_3px_0_0_var(--color-brand-strong)]', off: 'text-brand dark:text-teal-300', text: 'text-brand dark:text-teal-300' },
  servicios: { on: 'bg-sky-500 text-white shadow-[0_3px_0_0_#0369a1]', off: 'text-sky-600 dark:text-sky-300', text: 'text-sky-700 dark:text-sky-300' },
  ofertas: { on: 'bg-rose-500 text-white shadow-[0_3px_0_0_#be123c]', off: 'text-rose-500 dark:text-rose-300', text: 'text-rose-600 dark:text-rose-300' },
  delivery: { on: 'bg-orange-500 text-white shadow-[0_3px_0_0_#c2410c]', off: 'text-orange-500 dark:text-orange-300', text: 'text-orange-600 dark:text-orange-300' },
};

/**
 * Barra de abajo del celular: Chats, Servicios, Ofertas y Delivery, cada una con su color y un ícono
 * grande (la activa, dentro de una burbuja). Lo demás está en el menú ☰.
 */
export function MobileNav({ section, unread, activeOrders }: MobileNavProps) {
  return (
    <nav aria-label="Navegación principal" className="safe-bottom flex shrink-0 border-t border-line bg-surface px-1 pt-1 pb-0.5 md:hidden">
      {MOBILE_NAV_ITEMS.map(({ id, to, label, icon: Icon }) => {
        const active = section === id;
        const tone = TONES[id]!;
        const badge = id === 'chats' ? unread : id === 'delivery' ? activeOrders : 0;
        return (
          <Link
            key={id}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0 py-0.5 text-[10px] font-bold transition-colors duration-200 ${active ? tone.text : 'text-ink-soft'}`}
          >
            <span className={`relative flex h-7 w-10 items-center justify-center rounded-lg transition-all duration-200 ${active ? `${tone.on} -translate-y-0.5` : tone.off}`}>
              <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
              {badge ? (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white ring-2 ring-surface">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
