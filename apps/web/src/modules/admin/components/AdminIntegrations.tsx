import type { AdminIntegration, IntegrableService, IntegrationTestResult, UpdateIntegrationRequest } from '@parla/types';
import { CheckCircle2, ChevronDown, Plug, Power, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { errorMessage, http } from '@shared/utils/http';
import { useAdminList } from '../hooks/use-admin.hook';

/**
 * Cada servicio que se conecta a la API de otra tienda. `demo`: la tienda de prueba del simulador
 * (se usa si soporte no escribe otra dirección).
 */
const SERVICE_INFO: Record<IntegrableService, { title: string; art: string; example: string; demo?: { name: string; baseUrl: string; prefix: string } }> = {
  tecnologia: { title: 'Tecnología', art: 'tecnologia', example: 'Celulares, laptops y accesorios', demo: { name: 'TecnoYa', baseUrl: 'http://localhost:4103', prefix: '/tecnoya/v1' } },
  ferreteria: { title: 'Ferretería', art: 'ferreteria', example: 'Herramientas, pinturas y materiales' },
  salud: { title: 'Salud', art: 'salud', example: 'Farmacia y productos de salud' },
};

const inputClass = 'h-12 w-full rounded-xl bg-surface-3 px-3 text-ink outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-teal-500/40';

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <input {...props} className={inputClass} />
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

/**
 * Un servicio: se pega la clave de API y «Conectar» prueba la conexión y, si funciona, lo enciende.
 * La dirección del sistema solo se pide si todavía falta; el resto, en «Opciones avanzadas».
 */
function IntegrationCard({ integration, onSaved }: { integration: AdminIntegration; onSaved: (i: AdminIntegration) => void }) {
  const info = SERVICE_INFO[integration.service];
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(integration.baseUrl || info.demo?.baseUrl || '');
  const [prefix, setPrefix] = useState(integration.prefix || info.demo?.prefix || '');
  const [name, setName] = useState(integration.name || info.demo?.name || info.title);
  const [adminKey, setAdminKey] = useState('');
  const [busy, setBusy] = useState<'connect' | 'off' | null>(null);
  const [result, setResult] = useState<IntegrationTestResult | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const needsUrl = !integration.baseUrl && !info.demo;
  const hasKey = !!apiKey.trim() || integration.apiKeySet;
  /** Las llaves de RED WIIIL empiezan con «wiiil_»: Parla usa su API v1 (no hace falta la ruta). */
  const redWiiil = apiKey.trim().startsWith('wiiil_') || (!apiKey.trim() && integration.format === 'redwiiil');
  const [moved, setMoved] = useState(false);

  /** Si en «Dirección» se pegó una clave (no una URL), se pasa sola a su campo. */
  const onUrlChange = (value: string) => {
    const v = value.trim();
    if (v && !/^https?:\/\//i.test(v) && !v.includes('.') && !v.includes(':') && v.length >= 16) {
      setApiKey(v);
      setBaseUrl('');
      setMoved(true);
    } else {
      setBaseUrl(value);
      setMoved(false);
    }
    setResult(null);
  };

  const save = (enabled: boolean) => {
    const body: UpdateIntegrationRequest = { name, enabled, baseUrl, prefix, apiKey: apiKey.trim() || undefined, adminKey: adminKey.trim() || undefined };
    return http.put<AdminIntegration>(`/admin/integrations/${integration.service}`, body);
  };

  const connect = async () => {
    setBusy('connect');
    setResult(null);
    try {
      if (!baseUrl.trim()) {
        // Sin dirección no se puede probar: se guarda la clave (apagado) para no perderla.
        onSaved(await save(false));
        setApiKey('');
        setResult({ ok: false, message: 'Clave guardada. Falta la dirección (URL) del sistema de la tienda para conectarse.', products: 0, sample: [] });
        return;
      }
      const test = await http.post<IntegrationTestResult>(`/admin/integrations/${integration.service}/test`, { baseUrl, prefix, apiKey: apiKey.trim() || undefined });
      setResult(test);
      const saved = await save(test.ok);
      onSaved(saved);
      setApiKey('');
      if (test.ok) toast(`${info.title} conectado: ya aparece en Servicios`, 'success');
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err), products: 0, sample: [] });
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    setBusy('off');
    try {
      onSaved(await save(false));
      setResult(null);
      toast(`${info.title} apagado: vuelve a «Pronto» en Servicios`, 'info');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid={`integration-${integration.service}`}>
      <header className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-3">
          <img src={`/services/${info.art}.png`} alt="" className="size-8 object-contain" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold text-ink">{info.title}</span>
          <span className="block text-xs text-ink-soft">{info.example}</span>
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${integration.enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-surface-3 text-ink-soft'}`}>
          {integration.enabled ? '✓ Conectado' : 'Sin conectar'}
        </span>
      </header>

      {redWiiil && (
        <p className="-mb-2 w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="redwiiil-detected">
          Clave de RED WIIIL detectada · se usa su API para sistemas externos
        </p>
      )}
      <Field
        label="Clave de API"
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(e) => {
          setApiKey(e.target.value);
          setResult(null);
        }}
        placeholder={integration.apiKeySet ? `Guardada (${integration.apiKeyHint}) · pega otra para cambiarla` : 'Pega aquí la clave que te dio la tienda'}
      />

      {(needsUrl || advanced || redWiiil) && (
        <Field
          label="Dirección (URL) del sistema de la tienda"
          value={baseUrl}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={redWiiil ? 'http://localhost:3000 o el dominio de RED WIIIL' : 'https://api.tienda.pe'}
          inputMode="url"
          hint={redWiiil ? 'Donde abre RED WIIIL en el navegador; basta el inicio (p. ej. http://localhost:3000).' : 'Te la da la tienda junto con la clave.'}
        />
      )}
      {moved && (
        <p className="-mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Eso era la clave, no la dirección: la pasamos a «Clave de API». Ahora escribe la dirección.</p>
      )}

      {result && (
        <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${result.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'}`} role="status" data-testid="integration-test-result">
          {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          <span>
            <b>{result.message}</b>
            {result.sample.length > 0 && <span className="block text-xs opacity-80">Por ejemplo: {result.sample.join(' · ')}</span>}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button icon={<Plug className="size-4" />} loading={busy === 'connect'} disabled={!hasKey && !baseUrl.trim()} onClick={() => void connect()} data-testid="integration-connect">
          {integration.enabled ? 'Volver a conectar' : 'Conectar'}
        </Button>
        {integration.enabled && (
          <Button variant="secondary" icon={<Power className="size-4" />} loading={busy === 'off'} onClick={() => void turnOff()} data-testid="integration-off">
            Apagar
          </Button>
        )}
      </div>

      <button type="button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="flex w-fit items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
        Opciones avanzadas <ChevronDown className={`size-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
      </button>
      {advanced && (
        <div className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-2">
          <Field label="Nombre de la tienda" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          {!redWiiil && <Field label="Ruta de la API" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="/tienda/v1" hint="Donde la tienda publica su catálogo." />}
          <Field
            label="Clave para cambiar precios y stock (opcional)"
            type="password"
            autoComplete="off"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder={integration.adminKeySet ? 'Guardada · pega otra para cambiarla' : 'Si la tienda te la dio'}
          />
          <p className="self-end text-xs text-ink-faint md:col-span-2">
            La tienda debe ofrecer la API de tienda de Parla: <code>…/catalogo</code>, <code>…/productos</code> y <code>…/pedidos</code>, con la clave en <code>x-api-key</code>.
          </p>
        </div>
      )}
    </article>
  );
}

/**
 * Integraciones: soporte pega la clave de API de cada tienda y la conecta. Conectada, el servicio
 * aparece en Servicios con el catálogo de esa tienda y se compra como en el Mercado.
 */
export function AdminIntegrations() {
  const list = useAdminList<AdminIntegration>('/admin/integrations');
  const [items, setItems] = useState<AdminIntegration[] | null>(null);
  useEffect(() => setItems(list.items), [list.items]);

  if (list.error && !items) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!items) return <ListSkeleton rows={2} />;
  return (
    <div className="flex flex-col gap-4" data-testid="admin-integrations">
      <p className="rounded-2xl bg-surface-3 p-3 text-sm text-ink-soft">
        Pega la <b className="text-ink">clave de API</b> que te dio cada tienda y toca <b className="text-ink">Conectar</b>. Si funciona, el servicio aparece en Servicios y los clientes ya pueden comprar. Las claves se guardan y nunca se vuelven a mostrar completas.
      </p>
      {items.map((integration) => (
        <IntegrationCard key={integration.service} integration={integration} onSaved={(saved) => setItems(items.map((i) => (i.service === saved.service ? saved : i)))} />
      ))}
    </div>
  );
}
