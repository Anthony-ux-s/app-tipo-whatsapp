import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { CONNECT_STEPS, useConnectFerrohub } from '../hooks/use-ferrohub.hook';

/** «Ya uso FerroHub»: el código de enlace que se genera en Configuración → Pedidos en línea de FerroHub. */
export function FerrohubConnectView() {
  const c = useConnectFerrohub();
  return (
    <ServicePage>
      <PageHeader title="Conectar mi tienda" subtitle="Abre FerroHub → Configuración → Pedidos en línea y toca «Generar código de enlace»." onBack={c.back} />
      <form
        className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (c.complete && !c.busy) c.submit();
        }}
        noValidate
      >
        <Field
          label="Código de enlace"
          placeholder="FH-XXXX-XXXX"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          icon={<KeyRound className="size-5" />}
          value={c.code}
          disabled={c.busy}
          onChange={(e) => c.onCodeChange(e.target.value)}
          data-testid="ferrohub-code"
        />
        <p className="-mt-2 text-xs text-ink-faint">Se usa una sola vez y vence en 10 minutos.</p>
        {c.error && <FieldError message={c.error} />}
        <Button type="submit" size="lg" fullWidth loading={c.busy} disabled={!c.complete} data-testid="ferrohub-connect">
          Conectar
        </Button>
        {c.busy && (
          <ol className="flex flex-col gap-1.5" aria-live="polite" data-testid="connect-steps">
            {CONNECT_STEPS.map((label, index) => (
              <li key={label} className={`flex items-center gap-2 text-sm ${index <= c.step ? 'text-ink' : 'text-ink-faint'}`}>
                {index < c.step ? <CheckCircle2 className="size-4 text-brand" /> : index === c.step ? <Loader2 className="size-4 animate-spin" /> : <span className="size-4" />}
                {label}
              </li>
            ))}
          </ol>
        )}
      </form>
      <p className="flex items-start gap-2 text-xs text-ink-faint">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Tu llave de FerroHub se guarda cifrada en el servidor de Parla y nunca llega a tu navegador. Puedes desvincular la tienda cuando quieras.
      </p>
    </ServicePage>
  );
}
