import type { SessionUser } from '@parla/types';
import { Link } from 'react-router';
import { Avatar } from '@shared/ui/Avatar';
import { LogoMark } from '@shared/ui/Logo';
import { NAV_ITEMS, type AppSection } from '../const/navigation.const';

interface AppRailProps {
  user: SessionUser;
  section: AppSection;
  unread: number;
}

/** Barra de secciones (solo escritorio): Chats, Servicios, Tareas y Ajustes, como en WeChat. */
export function AppRail({ user, section, unread }: AppRailProps) {
  const main = NAV_ITEMS.filter((item) => item.id !== 'ajustes');
  const settings = NAV_ITEMS.find((item) => item.id === 'ajustes')!;
  const itemClass = (active: boolean) =>
    `relative flex size-11 items-center justify-center rounded-xl transition-colors duration-200 ${active ? 'bg-teal-800 text-white' : 'text-teal-300 hover:bg-teal-900 hover:text-white'}`;

  return (
    <nav aria-label="Secciones" className="hidden w-[72px] shrink-0 flex-col items-center gap-2 bg-teal-950 py-4 md:flex dark:bg-[#071015]">
      <Link to="/app" aria-label="Inicio" className="mb-3">
        <LogoMark className="size-10" />
      </Link>
      <div className="flex flex-1 flex-col items-center gap-2">
        {main.map(({ id, to, label, icon: Icon }) => (
          <Link key={id} to={to} title={label} aria-label={label} aria-current={section === id ? 'page' : undefined} className={itemClass(section === id)}>
            <Icon className="size-5" />
            {id === 'chats' && unread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-teal-950">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
        ))}
      </div>
      <Link to={settings.to} title={settings.label} aria-label={settings.label} className={itemClass(section === 'ajustes')}>
        <settings.icon className="size-5" />
      </Link>
      <Link to="/app/ajustes/perfil" title={user.displayName} aria-label="Tu perfil" className="mt-1">
        <Avatar name={user.displayName} color={user.avatarColor} size="sm" online />
      </Link>
    </nav>
  );
}
