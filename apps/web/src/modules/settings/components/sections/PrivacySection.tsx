import { KeyRound, Lock, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFingerprint } from '../../hooks/use-settings.hook';
import { SettingsBlock, SettingsGroup } from '../SettingsUi';

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3.5 md:px-5">
      <span className="mt-0.5 text-brand dark:text-teal-300">{icon}</span>
      <div>
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="text-sm text-ink-soft">{children}</p>
      </div>
    </div>
  );
}

export function PrivacySection() {
  const fingerprint = useFingerprint();
  return (
    <>
      <SettingsGroup title="Cifrado">
        <Point icon={<Lock className="size-5" />} title="Cifrado de extremo a extremo">
          Mensajes, fotos, notas de voz, tareas y llamadas solo los pueden leer o ver las personas del chat.
        </Point>
        <Point icon={<KeyRound className="size-5" />} title="Tu clave vive en este dispositivo">
          En el servidor solo se guarda una copia cifrada con tu contraseña, para que puedas entrar desde otro equipo.
        </Point>
        <Point icon={<Server className="size-5" />} title="El servidor no puede leer tus chats">
          Solo ve lo necesario para entregar: quién habla con quién y cuándo.
        </Point>
      </SettingsGroup>

      <SettingsGroup title="Tu huella de seguridad" footer="Compárala en persona con quien hablas: si coincide con la que ve en tu contacto, nadie se interpone.">
        <SettingsBlock>
          {fingerprint ? (
            <p className="grid grid-cols-4 gap-x-3 gap-y-1.5 font-mono text-[15px] tracking-wide text-ink sm:grid-cols-6" data-testid="fingerprint">
              {fingerprint.map((group, i) => (
                <span key={i}>{group}</span>
              ))}
            </p>
          ) : (
            <p className="text-sm text-ink-faint">Calculando…</p>
          )}
        </SettingsBlock>
      </SettingsGroup>

      <p className="px-4 text-xs text-ink-faint">
        Tratamos tus datos según la Ley 1581 de 2012 (Colombia), la LGPD (Brasil) y normas equivalentes.
      </p>
    </>
  );
}
