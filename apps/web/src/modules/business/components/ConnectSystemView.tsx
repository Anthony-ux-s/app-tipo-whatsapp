import { CheckCircle2, ChevronDown, Plug, Power, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useIntegration } from '../hooks/use-integration.hook';
import { CatalogSourceSwitch } from './CatalogSourceSwitch';

/**
 * «Conectar mi sistema»: la tienda que ya tiene su propia API la conecta con su URL y su llave. Con
 * «Probar conexión» se revisa antes de guardar; al guardar, sus productos salen de ahí.
 */
export function ConnectSystemView() {
  const navigate = useNavigate();
  const business = useBusinessStore((s) => s.business);
  if (business === null) return <Navigate to="/app/negocio/abrir" replace />;
  return <ConnectForm onBack={() => navigate('/app/negocio')} source={business?.source ?? 'native'} />;
}

function ConnectForm({ onBack, source }: { onBack: () => void; source: 'native' | 'api' }) {
  const i = useIntegration();
  const [advanced, setAdvanced] = useState(false);
  const connected = i.info?.source === 'api';
  return (
    <ServicePage>
      <PageHeader title="Conectar mi sistema" subtitle="Usa los productos y precios de tu propio sistema." onBack={onBack} />
      <CatalogSourceSwitch current="api" source={i.info?.source ?? source} />

      {i.error && !i.info ? (
        <ErrorState message={i.error} onRetry={i.retry} />
      ) : !i.info ? (
        <ListSkeleton rows={3} />
      ) : (
        <form
          className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void i.save();
          }}
          data-testid="integration-form"
        >
          <p className="text-sm text-ink-soft">
            {connected
              ? 'Tu sistema está conectado: tus clientes ven los productos y precios que Parla consulta de ahí.'
              : 'Escribe la dirección de tu sistema y la llave que te dieron. Con «Probar conexión» revisamos que todo funcione antes de guardar.'}
          </p>

          <Field
            label="Dirección (URL) de tu sistema"
            value={i.baseUrl}
            onChange={(e) => i.onBaseUrl(e.target.value)}
            placeholder="https://api.mitienda.pe"
            inputMode="url"
            autoComplete="off"
            hint={i.redWiiil ? 'Donde abre RED WIIIL en el navegador; basta el inicio de la dirección.' : 'Te la da quien hizo tu sistema, junto con la llave.'}
          />
          <Field
            label="Llave de acceso (API key)"
            type="password"
            autoComplete="off"
            value={i.apiKey}
            onChange={(e) => i.onApiKey(e.target.value)}
            placeholder={i.info.apiKeySet ? `Guardada (${i.info.apiKeyHint ?? '••••'}) · escribe otra para cambiarla` : 'Pega aquí la llave'}
            hint="Se guarda de forma segura y nunca se vuelve a mostrar completa."
          />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-ink">Tipo de sistema</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['parla', 'API de tienda de Parla'],
                  ['redwiiil', 'RED WIIIL'],
                ] as const
              ).map(([id, label]) => (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-2.5 text-center text-sm font-semibold transition-colors duration-200 ${i.format === id ? 'border-brand bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300' : 'border-line text-ink-soft hover:border-teal-300'}`}
                >
                  <input type="radio" name="formato" value={id} checked={i.format === id} onChange={() => i.onFormat(id)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {i.result && (
            <div
              className={`flex items-start gap-2 rounded-xl p-3 text-sm ${i.result.ok ? 'bg-emerald-50 text-ink dark:bg-emerald-950/50 dark:text-ink' : 'bg-rose-50 text-ink dark:bg-rose-950/50 dark:text-ink'}`}
              role="status"
              data-testid="integration-test-result"
            >
              {i.result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
              <span>
                <b>{i.result.message}</b>
                {i.result.sample.length > 0 && <span className="block text-xs opacity-80">Por ejemplo: {i.result.sample.join(' · ')}</span>}
              </span>
            </div>
          )}

          <button type="button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="flex w-fit items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
            Opciones avanzadas <ChevronDown className={`size-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
          </button>
          {advanced && (
            <div className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-2">
              {!i.redWiiil && <Field label="Ruta de la API" value={i.prefix} onChange={(e) => i.onPrefix(e.target.value)} placeholder="/tienda/v1" hint="Donde tu sistema publica el catálogo." />}
              <Field
                label="Llave para cambiar precios y stock (opcional)"
                type="password"
                autoComplete="off"
                value={i.adminKey}
                onChange={(e) => i.onAdminKey(e.target.value)}
                placeholder={i.info.adminKeySet ? 'Guardada · escribe otra para cambiarla' : 'Si tu sistema te la dio'}
              />
              <p className="text-xs text-ink-faint md:col-span-2">
                Tu sistema debe ofrecer la API de tienda de Parla: <code>…/catalogo</code>, <code>…/productos</code> y <code>…/pedidos</code>, con la llave en <code>x-api-key</code>.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Plug className="size-4" />} loading={i.busy === 'test'} disabled={!i.canSubmit} onClick={() => void i.test()} data-testid="integration-test">
              Probar conexión
            </Button>
            <Button type="submit" loading={i.busy === 'save'} disabled={!i.canSubmit} data-testid="integration-save">
              {connected ? 'Guardar cambios' : 'Conectar mi sistema'}
            </Button>
            {connected && (
              <Button variant="ghost" icon={<Power className="size-4" />} loading={i.busy === 'off'} onClick={() => void i.disconnect()} data-testid="integration-off">
                Usar el catálogo de Parla
              </Button>
            )}
          </div>
        </form>
      )}
    </ServicePage>
  );
}
