import { ChevronRight, ExternalLink, Lock, LogOut } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { LEGAL_LINKS, SETTINGS_GROUPS, SETTINGS_SECTIONS } from '../const/settings.const';
import { useSettingsHome } from '../hooks/use-settings.hook';
import { SettingsGroup, SettingsPage, SettingsRow } from './SettingsUi';

/** Ajustes: tarjeta del perfil y secciones agrupadas; cada una abre su propia pantalla. */
export function SettingsView() {
  const s = useSettingsHome();
  return (
    <SettingsPage>
      <h1 className="px-1 pt-1 text-2xl font-extrabold text-ink">Ajustes</h1>

      <Link
        to="perfil"
        aria-label="Perfil"
        className="group flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-float transition-colors duration-200 hover:bg-surface-2 md:p-5"
      >
        <Avatar name={s.user.displayName} color={s.user.avatarColor} photo={s.user.avatarUrl} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-ink">{s.user.displayName}</span>
          <span className="block truncate text-sm text-ink-soft">{s.user.about || 'Agrega una info. para tus contactos'}</span>
          <span className="block truncate text-xs text-ink-faint">{s.handle}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>

      {SETTINGS_GROUPS.map((group) => (
        <SettingsGroup key={group.title} title={group.title}>
          {group.sections.map((id) => {
            const section = SETTINGS_SECTIONS[id];
            return <SettingsRow key={id} to={id} icon={section.icon} title={section.title} summary={s.summaries[id] ?? section.summary} />;
          })}
        </SettingsGroup>
      ))}

      <SettingsGroup title="Legal">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="flex items-center justify-between gap-4 px-4 py-3.5 text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-surface-2 md:px-5">
            {link.label}
            <ExternalLink className="size-4 text-ink-faint" />
          </Link>
        ))}
      </SettingsGroup>

      <SettingsGroup>
        <button
          type="button"
          onClick={s.askLogout}
          className="flex w-full items-center gap-4 px-4 py-3.5 text-left text-[15px] font-semibold text-teal-900 transition-colors duration-200 hover:bg-surface-2 md:px-5 dark:text-teal-200"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-3">
            <LogOut className="size-5" />
          </span>
          Cerrar sesión
        </button>
      </SettingsGroup>

      <p className="flex items-center justify-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3.5" /> Tus mensajes están cifrados de extremo a extremo · Parla 0.1
      </p>

      <Modal
        open={s.confirmLogout}
        onClose={s.cancelLogout}
        size="sm"
        title="¿Cerrar sesión?"
        footer={
          <>
            <Button variant="ghost" onClick={s.cancelLogout}>Cancelar</Button>
            <Button variant="danger" icon={<LogOut className="size-4" />} onClick={s.logout}>Cerrar sesión</Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Se borrará tu clave privada de este dispositivo. Vuelve a entrar con tu contraseña para recuperarla y seguir leyendo tus chats.
        </p>
      </Modal>
    </SettingsPage>
  );
}
