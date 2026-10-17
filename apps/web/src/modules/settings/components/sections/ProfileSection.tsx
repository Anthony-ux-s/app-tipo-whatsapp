import { AVATAR_COLOR_LABELS, AVATAR_GRADIENTS } from '@shared/const/avatar.const';
import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import { Field, TextAreaField } from '@shared/ui/Field';
import { useProfileSettings } from '../../hooks/use-settings.hook';
import { InfoRow, SettingsBlock, SettingsGroup } from '../SettingsUi';

export function ProfileSection() {
  const p = useProfileSettings();
  return (
    <>
      <div className="flex flex-col items-center gap-3 py-2">
        <Avatar name={p.displayName || p.user.displayName} color={p.user.avatarColor} size="xl" />
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
              className={`size-8 rounded-full bg-gradient-to-br transition-transform duration-200 hover:scale-110 ${AVATAR_GRADIENTS[color]} ${p.user.avatarColor === color ? 'scale-110 ring-2 ring-teal-500 ring-offset-2 ring-offset-canvas' : ''}`}
            />
          ))}
        </div>
      </div>

      <SettingsGroup title="Cómo te ven">
        <SettingsBlock>
          <div className="flex flex-col gap-4">
            <Field label="Nombre" value={p.displayName} maxLength={60} onChange={(e) => p.onDisplayNameChange(e.target.value)} />
            <TextAreaField
              label="Info."
              value={p.about}
              maxLength={140}
              placeholder="Cuéntale a tu equipo qué haces"
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

      <SettingsGroup title="Cuenta" footer="Tu usuario y tu teléfono sirven para entrar; no se pueden cambiar desde aquí.">
        {p.user.username && <InfoRow label="Usuario" value={`@${p.user.username}`} />}
        {p.user.phone && <InfoRow label="Teléfono" value={p.user.phone} />}
        <InfoRow label="Miembro desde" value={p.memberSince} />
      </SettingsGroup>
    </>
  );
}
