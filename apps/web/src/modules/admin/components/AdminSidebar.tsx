import { ChevronLeft, ChevronRight, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { Avatar } from '@shared/ui/Avatar';
import { LogoMark } from '@shared/ui/Logo';
import { ADMIN_NAV } from '../const/admin-nav.const';

const COLLAPSED_KEY = 'parla.admin.sidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const itemClass = (active: boolean, collapsed: boolean) =>
  `group relative flex items-center rounded-xl text-sm transition-colors duration-150 ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} ${
    active ? 'bg-teal-50 font-bold text-ink dark:bg-teal-950/60' : 'font-medium text-ink-soft hover:bg-surface-3 hover:text-ink'
  }`;

/** Menú lateral del panel de soporte: secciones agrupadas, cuenta y salir. Se puede plegar a solo íconos. */
export function AdminSidebar() {
  const user = useSessionStore((s) => s.user)!;
  const logout = useSessionStore((s) => s.logout);
  const [folded, setFolded] = useState(readCollapsed);
  const collapsed = folded;

  const toggle = () => {
    setFolded((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      } catch {
        // Sin almacenamiento: solo no se recuerda la preferencia.
      }
      return !value;
    });
  };

  return (
    <aside
      className={`relative flex h-full flex-col border-r border-line bg-surface transition-[width] duration-300 ${collapsed ? 'w-[72px]' : 'w-64'}`}
      aria-label="Panel de soporte"
    >
      <div className={`flex h-16 shrink-0 items-center border-b border-line ${collapsed ? 'justify-center' : 'gap-3 px-4'}`}>
        <LogoMark className="size-9 shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display text-lg leading-none font-extrabold tracking-tight text-ink">parla</p>
            <p className="mt-1 flex items-center gap-1 text-[10px] font-bold tracking-widest text-ink-soft uppercase">
              <ShieldCheck className="size-3" /> Administración
            </p>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Secciones">
        {ADMIN_NAV.map((group, index) => (
          <div key={group.label} className={index > 0 ? 'mt-4' : ''}>
            {collapsed ? (
              index > 0 && <div className="mx-3 mb-2 h-px bg-line" />
            ) : (
              <p className="px-3 pb-1.5 text-[10px] font-extrabold tracking-widest text-ink-soft uppercase">{group.label}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ id, label, hint, icon: Icon }) => (
                <li key={id}>
                  <NavLink
                    to={`/app/admin/${id}`}
                    data-testid={`admin-tab-${id}`}
                    title={collapsed ? label : hint}
                    className={({ isActive }) => itemClass(isActive, collapsed)}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && !collapsed && <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" />}
                        <Icon className={`size-[18px] shrink-0 ${isActive ? 'text-brand dark:text-teal-300' : ''}`} />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        <NavLink to="/app/ajustes" title={collapsed ? 'Ajustes' : undefined} className={({ isActive }) => itemClass(isActive, collapsed)}>
          <Settings className="size-[18px] shrink-0" />
          {!collapsed && <span>Ajustes</span>}
        </NavLink>
        <button
          type="button"
          onClick={() => logout()}
          title={collapsed ? 'Salir' : undefined}
          className={`flex w-full items-center rounded-xl text-sm font-medium text-rose-700 transition-colors duration-150 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5'}`}
        >
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && <span>Salir</span>}
        </button>
        <div className={`mt-2 flex items-center border-t border-line pt-3 ${collapsed ? 'justify-center' : 'gap-3 px-2'}`}>
          <Avatar name={user.displayName} color={user.avatarColor} photo={user.avatarUrl} size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{user.displayName}</p>
              <p className="truncate text-xs text-ink-soft">Administrador</p>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Abrir el menú lateral' : 'Plegar el menú lateral'}
        className="absolute top-[72px] -right-3 z-10 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-float transition-colors hover:text-ink"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>
    </aside>
  );
}
