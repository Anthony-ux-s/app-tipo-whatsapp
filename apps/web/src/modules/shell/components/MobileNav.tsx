import { MessageCircle, Settings, Users } from 'lucide-react';
import { NavLink } from 'react-router';

interface MobileNavProps {
  workspaceId: string;
  unread: number;
}

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors duration-200 ${isActive ? 'text-brand dark:text-teal-300' : 'text-ink-soft'}`;

/** Navegación inferior del celular. */
export function MobileNav({ workspaceId, unread }: MobileNavProps) {
  return (
    <nav aria-label="Navegación principal" className="safe-bottom flex shrink-0 border-t border-line bg-surface md:hidden">
      <NavLink to={`/app/w/${workspaceId}`} end className={itemClass}>
        {({ isActive }) => (
          <>
            <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${isActive ? 'bg-teal-100 dark:bg-teal-900/60' : ''}`}>
              <MessageCircle className="size-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
            Chats
          </>
        )}
      </NavLink>
      <NavLink to={`/app/w/${workspaceId}/equipo`} className={itemClass}>
        {({ isActive }) => (
          <>
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${isActive ? 'bg-teal-100 dark:bg-teal-900/60' : ''}`}>
              <Users className="size-5" />
            </span>
            Equipo
          </>
        )}
      </NavLink>
      <NavLink to={`/app/w/${workspaceId}/ajustes`} className={itemClass}>
        {({ isActive }) => (
          <>
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${isActive ? 'bg-teal-100 dark:bg-teal-900/60' : ''}`}>
              <Settings className="size-5" />
            </span>
            Ajustes
          </>
        )}
      </NavLink>
    </nav>
  );
}
