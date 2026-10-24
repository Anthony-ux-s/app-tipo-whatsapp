import { Grid3x3, Hash, ShieldAlert } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { CodeEntry } from '@shared/ui/CodeEntry';
import { Modal } from '@shared/ui/Modal';
import { Toggle } from '@shared/ui/Toggle';
import { AUTO_LOCK_OPTIONS, PATTERN_MIN_DOTS } from '@shared/utils/app-lock';
import { useAppLockSettings, type LockFlow } from '../../hooks/use-app-lock-settings.hook';
import { InfoRow, SettingsBlock, SettingsGroup } from '../SettingsUi';

function flowTitle(flow: LockFlow): string {
  switch (flow.step) {
    case 'kind':
      return 'Elige cómo desbloquear';
    case 'enter':
      return flow.kind === 'pin' ? `Crea un PIN de ${flow.length} dígitos` : 'Dibuja tu patrón';
    case 'confirm':
      return flow.kind === 'pin' ? 'Repite tu PIN' : 'Dibuja el patrón otra vez';
    case 'verify':
      return flow.then === 'disable' ? 'Pon tu código para desactivar' : 'Pon tu código actual';
  }
}

/** Ajustes → Seguridad: candado de la app con PIN o patrón. */
export function SecuritySection() {
  const lock = useAppLockSettings();
  const { config, flow } = lock;
  const verifyKind = config ?? null;

  return (
    <>
      <SettingsGroup title="Bloqueo de la app" footer="El código se guarda solo en este dispositivo (como un resumen, nunca el código) y se pide al abrir Parla. No reemplaza tu contraseña.">
        <SettingsBlock>
          <Toggle
            checked={config !== null}
            onChange={lock.toggle}
            label="Pedir PIN o patrón"
            description={config ? (config.kind === 'pin' ? `Bloqueo con PIN de ${config.length} dígitos` : 'Bloqueo con patrón') : 'Protege tus chats si alguien toma este dispositivo'}
          />
        </SettingsBlock>
        {config && (
          <>
            <InfoRow label="Tipo de bloqueo" value={config.kind === 'pin' ? `PIN de ${config.length} dígitos` : 'Patrón'} />
            <SettingsBlock>
              <Button variant="secondary" onClick={lock.change} data-testid="lock-change">
                Cambiar código
              </Button>
            </SettingsBlock>
          </>
        )}
      </SettingsGroup>

      {config && (
        <SettingsGroup title="Bloquear automáticamente">
          <SettingsBlock>
            <div className="flex flex-col gap-1" role="radiogroup" aria-label="Cuándo bloquear">
              {AUTO_LOCK_OPTIONS.map((option) => {
                const on = config.autoLockMs === option.value;
                return (
                  <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 hover:bg-surface-2">
                    <input type="radio" name="auto-lock" checked={on} onChange={() => lock.setAutoLock(option.value)} className="size-4 accent-[var(--color-brand)]" />
                    <span className="text-[15px] text-ink">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </SettingsBlock>
        </SettingsGroup>
      )}

      <p className="flex items-start gap-2 px-4 text-xs text-ink-faint">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        Si olvidas el código, tendrás que cerrar sesión y volver a entrar con tu contraseña.
      </p>

      <Modal open={flow !== null} onClose={lock.close} size="sm" title={flow ? flowTitle(flow) : ''}>
        {flow?.step === 'kind' && (
          <div className="flex flex-col gap-2">
            <KindOption icon={<Hash className="size-5" />} title="PIN de 4 dígitos" onClick={() => lock.chooseKind('pin', 4)} testId="lock-kind-pin4" />
            <KindOption icon={<Hash className="size-5" />} title="PIN de 6 dígitos" description="Más difícil de adivinar" onClick={() => lock.chooseKind('pin', 6)} testId="lock-kind-pin6" />
            <KindOption icon={<Grid3x3 className="size-5" />} title="Patrón" description={`Une al menos ${PATTERN_MIN_DOTS} puntos`} onClick={() => lock.chooseKind('pattern', 0)} testId="lock-kind-pattern" />
          </div>
        )}
        {flow && flow.step !== 'kind' && (
          <div className="flex flex-col items-center gap-3">
            <CodeEntry
              key={flow.step + (flow.step === 'confirm' ? 'c' : '')}
              kind={flow.step === 'verify' ? (verifyKind?.kind ?? 'pin') : flow.kind}
              length={flow.step === 'verify' ? (verifyKind?.length ?? 4) : flow.length}
              onSubmit={(code) => void lock.submit(code)}
              disabled={lock.busy}
              errorKey={lock.errorKey}
            />
            {lock.message && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{lock.message}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

function KindOption({ icon, title, description, onClick, testId }: { icon: React.ReactNode; title: string; description?: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3 text-left transition-colors hover:bg-surface-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {description && <span className="block text-sm text-ink-soft">{description}</span>}
      </span>
    </button>
  );
}
