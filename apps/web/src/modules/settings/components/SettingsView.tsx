import { Bell, KeyRound, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { AVATAR_COLOR_LABELS, AVATAR_GRADIENTS } from '@shared/const/avatar.const';
import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import { Field, TextAreaField } from '@shared/ui/Field';
import { Toggle } from '@shared/ui/Toggle';
import { THEME_OPTIONS } from '../const/settings.const';
import { useNotificationSettings } from '../hooks/use-notification-settings.hook';
import { useSettings } from '../hooks/use-settings.hook';

const THEME_ICONS = { light: <Sun className="size-4" />, dark: <Moon className="size-4" />, system: <Monitor className="size-4" /> };

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-float md:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
        <span className="text-brand dark:text-teal-300">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SettingsView() {
  const s = useSettings();
  const notifications = useNotificationSettings();
  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-3 sm:p-4 md:gap-6 md:p-6 lg:p-8">
        <header className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-teal-700 to-cyan-800 p-5 text-white shadow-float md:p-6">
          <Avatar name={s.user.displayName} color={s.user.avatarColor} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold md:text-2xl">{s.user.displayName}</h1>
            <p className="truncate text-sm text-teal-100">{s.user.username ? `@${s.user.username}` : s.user.phone}</p>
          </div>
        </header>

        <Card icon={<UserRound className="size-5" />} title="Perfil">
          <div className="flex flex-col gap-4">
            <Field label="Nombre" value={s.displayName} maxLength={60} onChange={(e) => s.onDisplayNameChange(e.target.value)} />
            <TextAreaField label="Info." value={s.about} maxLength={140} placeholder="Cuéntale a tu equipo qué haces" onChange={(e) => s.onAboutChange(e.target.value)} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-faint">
                {s.user.phone && <>Teléfono: {s.user.phone} · </>}Miembro desde {new Date(s.user.createdAt).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
              </p>
              <Button size="sm" disabled={!s.dirty} loading={s.saving} onClick={s.saveProfile}>
                Guardar cambios
              </Button>
            </div>
          </div>
        </Card>

        <Card icon={<Palette className="size-5" />} title="Apariencia">
          <p className="mb-2 text-sm font-medium text-ink">Tema</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => s.setTheme(t.id)}
                aria-pressed={s.user.preferences.theme === t.id}
                className={`flex h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] border text-sm font-semibold transition-all duration-200 ${s.user.preferences.theme === t.id ? 'border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200' : 'border-line text-ink-soft hover:text-ink'}`}
              >
                {THEME_ICONS[t.id]} {t.label}
              </button>
            ))}
          </div>
          <p className="mt-5 mb-2 text-sm font-medium text-ink">Color de tu avatar</p>
          <div className="flex flex-wrap gap-2">
            {s.colors.map((color) => (
              <button
                key={color}
                type="button"
                title={AVATAR_COLOR_LABELS[color]}
                aria-label={AVATAR_COLOR_LABELS[color]}
                aria-pressed={s.user.avatarColor === color}
                onClick={() => s.pickColor(color)}
                className={`size-9 rounded-full bg-gradient-to-br transition-transform duration-200 ${AVATAR_GRADIENTS[color]} ${s.user.avatarColor === color ? 'scale-110 ring-2 ring-teal-500 ring-offset-2 ring-offset-surface' : ''}`}
              />
            ))}
          </div>
        </Card>

        <Card icon={<KeyRound className="size-5" />} title="Chats">
          <Toggle checked={s.user.preferences.enterToSend} onChange={s.setEnterToSend} label="Enviar con Enter" description="Usa Mayús + Enter para un salto de línea." />
          <Toggle checked={s.user.preferences.notificationSound} onChange={s.setSound} label="Sonido de mensajes" description="Suena cuando llega un mensaje en otro chat." />
        </Card>

        <Card icon={<Bell className="size-5" />} title="Notificaciones">
          <Toggle
            checked={notifications.enabled}
            onChange={notifications.toggle}
            disabled={!notifications.available || notifications.busy}
            label="Notificaciones push en este dispositivo"
            description={notifications.description}
          />
        </Card>

        <Card icon={<ShieldCheck className="size-5" />} title="Seguridad y privacidad">
          <p className="text-sm text-ink-soft">
            Tus mensajes se cifran de extremo a extremo. Tu clave privada vive en este dispositivo y en el servidor solo se guarda cifrada con tu contraseña.
          </p>
          {s.fingerprint && (
            <div className="mt-4 rounded-[var(--radius-card)] bg-surface-2 p-3">
              <p className="text-xs font-semibold text-ink-soft">Tu huella de seguridad</p>
              <p className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1 font-mono text-[13px] text-ink sm:grid-cols-6">
                {s.fingerprint.map((g, i) => (
                  <span key={i}>{g}</span>
                ))}
              </p>
            </div>
          )}
          <p className="mt-4 text-xs text-ink-faint">
            Tratamos tus datos según la Ley 1581 de 2012 (Colombia), la LGPD (Brasil) y normas equivalentes. Puedes pedir su eliminación en cualquier momento.
          </p>
        </Card>

        <section className="mb-6 rounded-2xl bg-surface p-4 shadow-float md:p-6">
          {s.confirmLogout ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink">¿Cerrar sesión? Se borrará tu clave privada de este dispositivo; vuelve a entrar con tu contraseña para recuperarla.</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={s.cancelLogout}>Cancelar</Button>
                <Button variant="danger" size="sm" icon={<LogOut className="size-4" />} onClick={s.logout}>Cerrar sesión</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={s.askLogout} className="flex items-center gap-3 text-[15px] font-semibold text-teal-900 dark:text-teal-200">
              <LogOut className="size-5" /> Cerrar sesión
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
