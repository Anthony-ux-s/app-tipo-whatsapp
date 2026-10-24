import { Building2, Mail, MapPin, Phone, ShieldCheck, User } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useProvisionFerrohub } from '../hooks/use-ferrohub.hook';

/** «Crear mi ferretería»: Parla la crea en FerroHub con tus datos y te lleva a tu panel de dueño, sin otra cuenta ni clave. */
export function FerrohubCreateView() {
  const p = useProvisionFerrohub();
  return (
    <ServicePage>
      <PageHeader title="Crear mi ferretería" subtitle="Con tu cuenta de Parla: sin registrarte otra vez ni crear otra clave." onBack={p.back} />
      <form
        className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (p.valid && !p.busy) p.submit();
        }}
        noValidate
      >
        <Field label="Nombre de la ferretería" icon={<Building2 className="size-5" />} value={p.form.name} onChange={(e) => p.onChange({ name: e.target.value })} disabled={p.busy} maxLength={120} data-testid="ferre-name" />
        <Field
          label="Ciudad"
          icon={<MapPin className="size-5" />}
          value={p.form.city}
          onChange={(e) => p.onChange({ city: e.target.value })}
          disabled={p.busy}
          maxLength={80}
          hint="Solo la ciudad, para mostrarte a los clientes de tu zona. La dirección exacta la pones después en FerroHub, en Configuración → Datos de la tienda."
          data-testid="ferre-city"
        />

        <fieldset className="flex flex-col gap-2" disabled={p.busy}>
          <legend className="mb-1 text-sm font-medium text-ink">Rubros que vendes</legend>
          <div className="flex flex-wrap gap-1.5">
            {p.rubros.map((rubro) => {
              const on = p.form.categories?.includes(rubro);
              return (
                <button
                  key={rubro}
                  type="button"
                  aria-pressed={on}
                  onClick={() => p.toggleRubro(rubro)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${on ? 'border-brand bg-teal-50 text-ink dark:bg-teal-950/60' : 'border-line text-ink-soft hover:border-teal-300'}`}
                >
                  {rubro}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Tu nombre" icon={<User className="size-5" />} value={p.form.ownerName} onChange={(e) => p.onChange({ ownerName: e.target.value })} disabled={p.busy} maxLength={120} />
        <Field label="Correo" type="email" icon={<Mail className="size-5" />} value={p.form.email} onChange={(e) => p.onChange({ email: e.target.value })} disabled={p.busy} autoComplete="email" />
        <Field label="Celular" type="tel" icon={<Phone className="size-5" />} value={p.form.phone} onChange={(e) => p.onChange({ phone: e.target.value })} disabled={p.busy} autoComplete="tel" />
        <Field label="RUC (opcional)" value={p.form.ruc ?? ''} onChange={(e) => p.onChange({ ruc: e.target.value })} disabled={p.busy} maxLength={20} inputMode="numeric" />

        {p.error && (
          <div className="flex flex-col gap-2">
            <FieldError message={p.error} />
            <button type="button" onClick={p.goConnect} className="self-start text-sm font-semibold text-brand hover:underline dark:text-teal-300">
              ¿Ya tienes FerroHub? Conéctala con un código
            </button>
          </div>
        )}
        <Button type="submit" size="lg" fullWidth loading={p.busy} disabled={!p.valid} data-testid="ferre-create-submit">
          Crear y abrir mi panel
        </Button>
      </form>
      <p className="flex items-start gap-2 text-xs text-ink-faint">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Empiezas en el plan Semilla, sin cuota fija. Tu tienda aparece en Parla en cuanto agregues tu primer producto.
      </p>
    </ServicePage>
  );
}
