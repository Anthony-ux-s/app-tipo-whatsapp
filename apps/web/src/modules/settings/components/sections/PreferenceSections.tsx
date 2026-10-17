import { Monitor, Moon, Sun } from 'lucide-react';
import { Toggle } from '@shared/ui/Toggle';
import { THEME_OPTIONS } from '../../const/settings.const';
import { useNotificationSettings } from '../../hooks/use-notification-settings.hook';
import { usePreferences } from '../../hooks/use-settings.hook';
import { SettingsBlock, SettingsGroup } from '../SettingsUi';

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };

export function AppearanceSection() {
  const p = usePreferences();
  return (
    <SettingsGroup title="Tema" footer="«Sistema» sigue el modo claro u oscuro de tu dispositivo.">
      <SettingsBlock>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
          {THEME_OPTIONS.map((t) => {
            const Icon = THEME_ICONS[t.id];
            const active = p.preferences.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => p.setTheme(t.id)}
                className={`flex flex-col items-center gap-2 rounded-[var(--radius-card)] border py-4 text-sm font-semibold transition-all duration-200 ${active ? 'border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200' : 'border-line text-ink-soft hover:border-teal-300 hover:text-ink'}`}
              >
                <Icon className="size-5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </SettingsBlock>
    </SettingsGroup>
  );
}

export function ChatsSection() {
  const p = usePreferences();
  return (
    <>
      <SettingsGroup title="Escribir">
        <SettingsBlock>
          <Toggle checked={p.preferences.enterToSend} onChange={p.setEnterToSend} label="Enviar con Enter" description="Usa Mayús + Enter para un salto de línea." />
        </SettingsBlock>
      </SettingsGroup>
      <SettingsGroup title="Sonidos">
        <SettingsBlock>
          <Toggle checked={p.preferences.notificationSound} onChange={p.setSound} label="Sonido de mensajes" description="Suena cuando llega un mensaje en otro chat." />
        </SettingsBlock>
      </SettingsGroup>
      <SettingsGroup title="Efectos" footer="Se calculan en tu dispositivo con el mensaje ya descifrado: el servidor no sabe qué escribiste.">
        <SettingsBlock>
          <Toggle
            checked={p.preferences.chatEffects}
            onChange={p.setEffects}
            label="Efectos en pantalla"
            description="«Feliz cumpleaños» trae confeti, «te quiero» corazones… y algunos stickers también."
          />
        </SettingsBlock>
      </SettingsGroup>
    </>
  );
}

export function NotificationsSection() {
  const n = useNotificationSettings();
  return (
    <SettingsGroup title="Este dispositivo" footer="Por privacidad, los avisos nunca muestran el contenido de los mensajes: van cifrados.">
      <SettingsBlock>
        <Toggle
          checked={n.enabled}
          onChange={n.toggle}
          disabled={!n.available || n.busy}
          label="Notificaciones push en este dispositivo"
          description={n.description}
        />
      </SettingsBlock>
    </SettingsGroup>
  );
}
