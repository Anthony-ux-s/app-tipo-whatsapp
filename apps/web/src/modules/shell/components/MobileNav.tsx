import { Link } from 'react-router';
import { NAV_ITEMS, type AppSection } from '../const/navigation.const';

interface MobileNavProps {
  section: AppSection;
  unread: number;
}

/** Navegación inferior del celular. */
export function MobileNav({ section, unread }: MobileNavProps) {
  return (
    <nav aria-label="Navegación principal" className="safe-bottom flex shrink-0 border-t border-line bg-surface md:hidden">
      {NAV_ITEMS.map(({ id, to, label, icon: Icon }) => {
        const active = section === id;
        const badge = id === 'chats' ? unread : 0;
        return (
          <Link
            key={id}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors duration-200 ${active ? 'text-brand dark:text-teal-300' : 'text-ink-soft'}`}
          >
            <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${active ? 'bg-teal-100 dark:bg-teal-900/60' : ''}`}>
              <Icon className="size-5" />
              {badge ? (
                <span className="absolute -top-0.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
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
