import { Bike, ChevronRight, Download, Package, Route, Settings, ShieldCheck, Store, Users, X, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { useDriverStore } from '@shared/stores/driver.store';
import { useSessionStore } from '@shared/stores/session.store';
import { Avatar } from '@shared/ui/Avatar';
import { useInstallApp } from '../hooks/use-install-app.hook';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../../settings/const/settings.const';

interface AppMenuProps {
  open: boolean;
  onClose: () => void;
  onNewGroup: () => void;
}

/** Solo los ajustes que más se cambian; el resto está en «Todos los ajustes». */
const MENU_SETTINGS: SettingsSectionId[] = ['perfil', 'direcciones', 'chats', 'apariencia'];
/** Nombres más claros en el menú (donde también está el botón «Chats»). */
const MENU_LABELS: Partial<Record<SettingsSectionId, string>> = { chats: 'Letra y chats' };

/** Color de cada botón grande (fondo del ícono y del botón): se reconocen sin leer. */
const TONES = {
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  green: 'bg-teal-50 text-brand dark:bg-teal-950/50 dark:text-teal-300',
} as const;
type Tone = keyof typeof TONES;

const tileClass = (tone: Tone) =>
  `flex items-center gap-2.5 rounded-xl p-2 text-left transition-transform duration-200 active:scale-[0.98] ${TONES[tone]}`;

function TileContent({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-sm dark:bg-black/20">
        <Icon className="size-[18px]" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 truncate text-sm leading-tight font-bold text-ink">{label}</span>
    </>
  );
}

/** Botón grande del menú (lo principal: pedidos, reparto, negocio…). */
function Tile({ to, icon, label, tone, onClose, className = '' }: { to: string; icon: LucideIcon; label: string; tone: Tone; onClose: () => void; className?: string }) {
  return (
    <Link to={to} onClick={onClose} className={`${tileClass(tone)} ${className}`}>
      <TileContent icon={icon} label={label} />
    </Link>
  );
}

/** Fila de ajustes: ícono de color, nombre y flecha. */
function SettingRow({ to, icon: Icon, label, onClose }: { to: string; icon: LucideIcon; label: string; onClose: () => void }) {
  return (
    <Link to={to} onClick={onClose} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[15px] font-semibold text-ink transition-colors duration-200 hover:bg-surface-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight className="size-4 text-ink-faint" />
    </Link>
  );
}

/**
 * Menú lateral (las tres líneas del encabezado): botones grandes con lo de cada cuenta y los ajustes
 * más usados. En la computadora los botones son compactos y no repiten Chats, Servicios, Ofertas ni
 * «Nuevo grupo».
 */
export function AppMenu({ open, onClose, onNewGroup }: AppMenuProps) {
  const user = useSessionStore((s) => s.user);
  // Tienda y reparto son de los clientes: soporte (que solo administra) no los ve.
  const business = useBusinessStore((s) => (user?.isAdmin ? undefined : s.business));
  const driver = useDriverStore((s) => (user?.isAdmin ? undefined : s.driver));
  const installApp = useInstallApp();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Menú">
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/40" />
      {/* En modo claro todo el texto del menú va en negro puro; en oscuro, blanco puro. */}
      <nav className="relative flex h-full w-[88%] max-w-84 animate-slide-in flex-col overflow-y-auto bg-surface shadow-pop [--ink-faint:#000000] [--ink-soft:#000000] [--ink:#000000] dark:[--ink-faint:#ffffff] dark:[--ink-soft:#ffffff] dark:[--ink:#ffffff]">
        <div className="flex items-start gap-3 bg-brand px-4 pt-5 pb-4 text-white">
          <Link to="/app/ajustes/perfil" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={user.displayName} color={user.avatarColor} photo={user.avatarUrl} size="lg" />
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold">{user.displayName}</span>
              <span className="block truncate text-sm text-white/80">{user.username ? `@${user.username}` : user.phone}</span>
            </span>
          </Link>
          <button type="button" onClick={onClose} aria-label="Cerrar menú" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 p-3" data-testid="menu-tiles">
          <Tile to="/app/pedidos" icon={Package} label="Mis pedidos" tone="orange" onClose={onClose} />
          {driver && <Tile to="/app/rapidito" icon={Bike} label="Rapidito" tone="rose" onClose={onClose} />}
          {driver && <Tile to="/app/rapidito/rutas" icon={Route} label="Mis rutas" tone="violet" onClose={onClose} />}
          {business && <Tile to="/app/negocio" icon={Store} label="Mi negocio" tone="amber" onClose={onClose} />}
          {business === null && <Tile to="/app/negocio/nueva" icon={Store} label="Crear tienda" tone="green" onClose={onClose} />}
          <button
            type="button"
            onClick={() => {
              onClose();
              onNewGroup();
            }}
            className={`${tileClass('sky')} md:hidden`}
          >
            <TileContent icon={Users} label="Nuevo grupo" />
          </button>
          {user.isAdmin && <Tile to="/app/admin" icon={ShieldCheck} label="Administración" tone="slate" onClose={onClose} />}
        </div>

        <p className="px-5 pt-1 pb-1 text-xs font-bold tracking-wider text-ink-faint uppercase">Configuración</p>
        <div className="flex flex-col gap-0.5 px-3 pb-4">
          {MENU_SETTINGS.map((id) => (
            <SettingRow key={id} to={`/app/ajustes/${id}`} icon={SETTINGS_SECTIONS[id].icon} label={MENU_LABELS[id] ?? SETTINGS_SECTIONS[id].title} onClose={onClose} />
          ))}
          <SettingRow to="/app/ajustes" icon={Settings} label="Todos los ajustes" onClose={onClose} />
          {installApp.available && (
            <button
              type="button"
              onClick={() => {
                onClose();
                void installApp.install();
              }}
              data-testid="install-app"
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[15px] font-semibold text-ink transition-colors duration-200 hover:bg-surface-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
                <Download className="size-5" />
              </span>
              <span className="min-w-0 flex-1 truncate">Instalar la app</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
