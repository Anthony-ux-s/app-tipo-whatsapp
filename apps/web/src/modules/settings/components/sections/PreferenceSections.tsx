import { Monitor, Moon, Sun } from 'lucide-react';
import { CHAT_FONT_FAMILIES, CHAT_FONT_OPTIONS, CHAT_FONT_SIZE_OPTIONS, CHAT_FONT_SIZES } from '@shared/const/chat-text.const';
import { Button } from '@shared/ui/Button';
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
                className={`flex flex-col items-center gap-2 rounded-[var(--radius-card)] border py-4 text-sm font-semibold transition-all duration-200 ${active ? 'border-teal-500 bg-teal-50 text-ink dark:bg-teal-950/60 dark:text-ink' : 'border-line text-ink-soft hover:border-teal-300 hover:text-ink'}`}
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

const optionClass = (active: boolean) =>
  `rounded-[var(--radius-card)] border px-2 py-3 text-sm font-semibold transition-all duration-200 ${active ? 'border-teal-500 bg-teal-50 text-ink dark:bg-teal-950/60 dark:text-ink' : 'border-line text-ink-soft hover:border-teal-300 hover:text-ink'}`;

export function ChatsSection() {
  const p = usePreferences();
  return (
    <>
      <SettingsGroup title="Letra de los mensajes" footer="Solo cambia en tus chats y en lo que escribes; tus contactos ven su propia letra.">
        <SettingsBlock>
          <div className="flex flex-col gap-4">
            <div className="rounded-[var(--radius-card)] bg-chat p-3" aria-hidden>
              <p className="chat-text ml-auto w-fit max-w-[85%] rounded-[var(--radius-bubble)] rounded-tr-sm bg-bubble-out px-3 py-1.5 text-ink">
                ¡Hola! Así se verán tus mensajes 👋
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Tamaño</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tamaño de letra">
                {CHAT_FONT_SIZE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={p.preferences.chatFontSize === o.id}
                    onClick={() => p.setChatFontSize(o.id)}
                    className={optionClass(p.preferences.chatFontSize === o.id)}
                  >
                    <span className="block" style={{ fontSize: CHAT_FONT_SIZES[o.id] }}>Aa</span>
                    <span className="block text-xs font-medium">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Tipo de letra</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de letra">
                {CHAT_FONT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={p.preferences.chatFont === o.id}
                    onClick={() => p.setChatFont(o.id)}
                    className={optionClass(p.preferences.chatFont === o.id)}
                    style={{ fontFamily: CHAT_FONT_FAMILIES[o.id] }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SettingsBlock>
      </SettingsGroup>
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
        {n.enabled && (
          <div className="mt-3">
            <Button variant="secondary" size="sm" loading={n.busy} onClick={() => void n.test()} data-testid="push-test">
              Enviar notificación de prueba
            </Button>
          </div>
        )}
      </SettingsBlock>
    </SettingsGroup>
  );
}
