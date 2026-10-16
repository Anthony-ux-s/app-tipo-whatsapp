import { ListChecks, MessageCircle, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

interface MobileNavProps {
  workspaceId: string;
  unread: number;
}

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors duration-200 ${isActive ? 'text-brand dark:text-teal-300' : 'text-ink-soft'}`;

function NavItem({ to, end = false, label, icon, badge }: { to: string; end?: boolean; label: string; icon: ReactNode; badge?: number }) {
  return (
    <NavLink to={to} end={end} className={itemClass}>
      {({ isActive }) => (
        <>
          <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${isActive ? 'bg-teal-100 dark:bg-teal-900/60' : ''}`}>
            {icon}
            {badge ? (
              <span className="absolute -top-0.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Navegación inferior del celular. */
export function MobileNav({ workspaceId, unread }: MobileNavProps) {
  const base = `/app/w/${workspaceId}`;
  return (
    <nav aria-label="Navegación principal" className="safe-bottom flex shrink-0 border-t border-line bg-surface md:hidden">
      <NavItem to={base} end label="Chats" icon={<MessageCircle className="size-5" />} badge={unread} />
      <NavItem to={`${base}/tareas`} label="Tareas" icon={<ListChecks className="size-5" />} />
      <NavItem to={`${base}/equipo`} label="Equipo" icon={<Users className="size-5" />} />
      <NavItem to={`${base}/ajustes`} label="Ajustes" icon={<Settings className="size-5" />} />
    </nav>
  );
}
