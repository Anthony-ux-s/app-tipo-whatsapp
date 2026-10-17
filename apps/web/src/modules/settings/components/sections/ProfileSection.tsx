import { AtSign, BadgeCheck } from 'lucide-react';
import { AVATAR_COLOR_LABELS, AVATAR_GRADIENTS } from '@shared/const/avatar.const';
import { Button } from '@shared/ui/Button';
import { Field, TextAreaField } from '@shared/ui/Field';
import { AvatarPicker } from '../../../account/components/AvatarPicker';
import { EmailVerificationForm } from '../../../account/components/EmailVerificationForm';
import { useProfileSettings } from '../../hooks/use-settings.hook';
import { InfoRow, SettingsBlock, SettingsGroup } from '../SettingsUi';

export function ProfileSection() {
  const p = useProfileSettings();
  return (
    <>
      <div className="flex flex-col items-center gap-3 py-2">
        <AvatarPicker name={p.displayName} />
        {!p.user.avatarUrl && (
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Color de tu avatar">
            {p.colors.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                title={AVATAR_COLOR_LABELS[color]}
                aria-label={AVATAR_COLOR_LABELS[color]}
                aria-checked={p.user.avatarColor === color}
                onClick={() => p.pickColor(color)}
                className={`size-7 rounded-full bg-gradient-to-br transition-transform duration-200 hover:scale-110 ${AVATAR_GRADIENTS[color]} ${p.user.avatarColor === color ? 'scale-110 ring-2 ring-teal-500 ring-offset-2 ring-offset-canvas' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      <SettingsGroup title="Cómo te ven">
        <SettingsBlock>
          <div className="flex flex-col gap-4">
            <Field label="Nombre" value={p.displayName} maxLength={60} onChange={(e) => p.onDisplayNameChange(e.target.value)} />
            <Field
              label="Nombre de usuario (opcional)"
              placeholder="ej. maria.lopez"
              autoCapitalize="none"
              icon={<AtSign className="size-5" />}
              value={p.username}
              maxLength={24}
              error={p.usernameError}
              hint="Para que te encuentren sin tu número. Déjalo vacío si no quieres tener uno."
              onChange={(e) => p.onUsernameChange(e.target.value)}
            />
            <TextAreaField
              label="Info."
              value={p.about}
              maxLength={140}
              placeholder="Cuéntales a tus contactos algo de ti"
              onChange={(e) => p.onAboutChange(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              {p.dirty && (
                <Button variant="ghost" size="sm" onClick={p.discard}>
                  Descartar
                </Button>
              )}
              <Button size="sm" disabled={!p.dirty || !p.valid} loading={p.saving} onClick={p.save}>
                Guardar cambios
              </Button>
            </div>
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title="Correo de recuperación" footer="Si olvidas tu contraseña, te enviamos un código a este correo para restablecerla.">
        <SettingsBlock>
          <EmailVerificationForm />
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title="Cuenta" footer="Tu teléfono es con el que te registraste y verificaste por SMS.">
        {p.user.phone && (
          <InfoRow
            label="Teléfono"
            value={
              <span className="inline-flex items-center gap-1.5">
                {p.user.phone} <BadgeCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Verificado" />
              </span>
            }
          />
        )}
        <InfoRow label="Miembro desde" value={p.memberSince} />
      </SettingsGroup>
    </>
  );
}
