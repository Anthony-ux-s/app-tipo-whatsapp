import { Bike, ChevronRight, Route, Settings, ShieldCheck, Store, Users, X, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { useDriverStore } from '@shared/stores/driver.store';
import { useSessionStore } from '@shared/stores/session.store';
import { Avatar } from '@shared/ui/Avatar';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../../settings/const/settings.const';
import { NAV_ITEMS } from '../const/navigation.const';

interface AppMenuProps {
  open: boolean;
  onClose: () => void;
  onNewGroup: () => void;
}

/** Ajustes que se ven en el menú, en orden: lo que más se cambia arriba. */
const MENU_SETTINGS: SettingsSectionId[] = ['perfil', 'direcciones', 'chats', 'apariencia', 'notificaciones', 'privacidad', 'datos'];

const rowClass = 'flex w-full items-center gap-3.5 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-surface-3';

function MenuRow({ to, icon: Icon, label, onClose }: { to: string; icon: LucideIcon; label: string; onClose: () => void }) {
  return (
    <Link to={to} onClick={onClose} className={rowClass}>
      <Icon className="size-5 shrink-0 text-brand dark:text-teal-300" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

/**
 * Menú lateral (las tres líneas del encabezado): todas las secciones, los pedidos y cada ajuste
 * en un solo lugar.
 */
export function AppMenu({ open, onClose, onNewGroup }: AppMenuProps) {
  const user = useSessionStore((s) => s.user);
  const business = useBusinessStore((s) => s.business);
  const driver = useDriverStore((s) => s.driver);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !user) return null;
  const sections = NAV_ITEMS.filter((item) => item.id !== 'ajustes');

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Menú">
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/40" />
      <nav className="relative flex h-full w-[86%] max-w-80 animate-slide-in flex-col overflow-y-auto bg-surface shadow-pop">
        <div className="flex items-start gap-3 bg-brand px-4 pt-5 pb-4 text-white">
          <Link to="/app/ajustes/perfil" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={user.displayName} color={user.avatarColor} photo={user.avatarUrl} size="lg" />
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold">{user.displayName}</span>
              <span className="block truncate text-sm text-white/80">{user.username ? `@${user.username}` : user.phone}</span>
            </span>
          </Link>
          <button type="button" onClick={onClose} aria-label="Cerrar menú" className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-0.5 p-2">
          {sections.map((item) => (
            <MenuRow key={item.id} to={item.to} icon={item.icon} label={item.id === 'delivery' ? 'Mis pedidos' : item.label} onClose={onClose} />
          ))}
          {business && <MenuRow to="/app/negocio" icon={Store} label={`Mi negocio · ${business.name}`} onClose={onClose} />}
          {driver && <MenuRow to="/app/rapidito" icon={Bike} label="Rapidito (repartidor)" onClose={onClose} />}
          {driver && <MenuRow to="/app/rapidito/rutas" icon={Route} label="Mis rutas" onClose={onClose} />}
          <button
            type="button"
            onClick={() => {
              onClose();
              onNewGroup();
            }}
            className={rowClass}
          >
            <Users className="size-5 shrink-0 text-brand dark:text-teal-300" />
            Nuevo grupo
          </button>
        </div>

        <div className="mx-4 border-t border-line" />
        <p className="px-5 pt-3 pb-1 text-xs font-bold tracking-wider text-ink-faint uppercase">Configuración</p>
        <div className="flex flex-col gap-0.5 p-2 pt-0">
          {MENU_SETTINGS.map((id) => (
            <MenuRow key={id} to={`/app/ajustes/${id}`} icon={SETTINGS_SECTIONS[id].icon} label={SETTINGS_SECTIONS[id].title} onClose={onClose} />
          ))}
          {user.isAdmin && <MenuRow to="/app/admin" icon={ShieldCheck} label="Panel de administración" onClose={onClose} />}
          <Link to="/app/ajustes" onClick={onClose} className={rowClass}>
            <Settings className="size-5 shrink-0 text-brand dark:text-teal-300" />
            <span className="flex-1">Todos los ajustes</span>
            <ChevronRight className="size-4 text-ink-faint" />
          </Link>
        </div>
      </nav>
    </div>
  );
}
