import type { IntegrationTestResult, StoreIntegrationFormat } from '@parla/types';
import { ValidationError } from '../../../kernel/domain-error';

const PREFIX = /^(\/[A-Za-z0-9._~-]+)*\/?$/;
const TEST_TIMEOUT_MS = 6_000;

/** La URL base de la API: http(s), sin usuario ni contraseña en la URL y sin barra final. */
export function normalizeBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError('Escribe la URL de la API completa (p. ej. https://api.tienda.pe)');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ValidationError('La URL debe empezar con https:// o http://');
  if (url.username || url.password) throw new ValidationError('No pongas usuario ni contraseña en la URL: usa la clave de API');
  if (url.search || url.hash) throw new ValidationError('La URL base no lleva «?» ni «#»');
  return value;
}

/** Las llaves de RED WIIIL empiezan con «wiiil_»: así se reconoce su API sin preguntar. */
export function formatFor(apiKey: string, chosen?: StoreIntegrationFormat, current: StoreIntegrationFormat = 'parla'): StoreIntegrationFormat {
  if (chosen) return chosen;
  return apiKey.startsWith('wiiil_') ? 'redwiiil' : current;
}

/** RED WIIIL publica su API en la raíz del sitio (/api/v1): de «…/admin/inventory» queda solo el origen. */
export function baseUrlFor(format: StoreIntegrationFormat, baseUrl: string): string {
  if (format !== 'redwiiil' || !baseUrl) return baseUrl;
  return new URL(baseUrl).origin;
}

export function normalizePrefix(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  // «tienda/v1» se entiende como «/tienda/v1».
  const value = trimmed && !trimmed.startsWith('/') ? `/${trimmed}` : trimmed;
  if (value && !PREFIX.test(value)) throw new ValidationError('La ruta de la API solo lleva letras, números, «-», «.» y «/» (p. ej. /tienda/v1)');
  return value;
}

/** Prefijo por defecto de la API de tienda de Parla. */
export const DEFAULT_STORE_PREFIX = '/mercaya/v1';

interface StoreCatalogBody {
  resultados?: { nombre?: string }[];
  error?: string;
}

const fail = (message: string): IntegrationTestResult => ({ ok: false, message, products: 0, sample: [] });

/**
 * «Probar conexión»: pide el catálogo a la API de la tienda con la URL y la clave que se están
 * editando y cuenta cuántos productos devuelve.
 */
export async function testStoreConnection(input: { baseUrl: string; prefix: string; apiKey: string; format: StoreIntegrationFormat }): Promise<IntegrationTestResult> {
  const baseUrl = baseUrlFor(input.format, normalizeBaseUrl(input.baseUrl));
  if (!baseUrl) throw new ValidationError('Escribe la URL de la API');
  if (input.format === 'redwiiil') return testRedWiiil(baseUrl, input.apiKey);
  const prefix = normalizePrefix(input.prefix) || DEFAULT_STORE_PREFIX;
  try {
    const res = await fetch(`${baseUrl}${prefix}/catalogo?buscar=`, {
      headers: { accept: 'application/json', ...(input.apiKey ? { 'x-api-key': input.apiKey } : {}) },
      // Sin seguir redirecciones: una página web que manda a iniciar sesión no es la API.
      redirect: 'manual',
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location') ?? '';
      const login = /login|signin|ingresar|auth/i.test(to);
      return fail(
        login
          ? 'Esa dirección es la página web de la tienda (te manda a iniciar sesión), no su API. Pide a la tienda la dirección de su API.'
          : `Esa dirección redirige a otra página${to ? ` (${to})` : ''}: no es la API. Pide a la tienda la dirección de su API.`,
      );
    }
    if (res.status === 401 || res.status === 403) return fail('La tienda rechazó la clave de API');
    if (res.status === 404) return fail('Esa dirección existe, pero no tiene el catálogo donde Parla lo busca: la API de la tienda usa otro formato o la ruta no es la correcta.');
    if (!res.ok) return fail(`La API respondió ${res.status}: revisa la dirección y la ruta`);
    if (!(res.headers.get('content-type') ?? '').includes('json')) return fail('Esa dirección devolvió una página web, no datos de una API. Pide a la tienda la dirección de su API.');
    const body = (await res.json()) as StoreCatalogBody;
    if (!Array.isArray(body.resultados)) return fail('La respuesta no tiene el formato de la API de tienda (falta «resultados»)');
    const names = body.resultados.map((p) => p.nombre).filter((n): n is string => typeof n === 'string');
    return { ok: true, message: `Conectado: ${names.length} productos en el catálogo`, products: names.length, sample: names.slice(0, 4) };
  } catch {
    return fail('No se pudo conectar con la API (¿la URL es correcta y está en línea?)');
  }
}

interface RedWiiilBody {
  data?: { nombre?: string }[];
  siguiente?: string | null;
  error?: { code?: string; message?: string };
}

/** Prueba la API v1 de RED WIIIL (GET /api/v1/products con la llave en Authorization: Bearer). */
async function testRedWiiil(baseUrl: string, apiKey: string): Promise<IntegrationTestResult> {
  if (!apiKey) return fail('Pega la llave de RED WIIIL (empieza con «wiiil_»)');
  try {
    const res = await fetch(`${baseUrl}/api/v1/products?limit=5`, {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as RedWiiilBody;
    const reason = body.error?.message;
    if (res.status === 401) return fail(`RED WIIIL no reconoce esa llave${reason ? `: ${reason}` : ''}`);
    if (res.status === 403) return fail(`La llave está desactivada o no tiene permiso para ver productos${reason ? `: ${reason}` : ''}`);
    if (res.status === 404) return fail('En esa dirección no está la API de RED WIIIL (/api/v1). Revisa la dirección del sistema.');
    if (!res.ok || !Array.isArray(body.data)) return fail(`RED WIIIL respondió ${res.status}${reason ? `: ${reason}` : ''}`);
    const names = body.data.map((p) => p.nombre).filter((n): n is string => typeof n === 'string');
    return { ok: true, message: body.siguiente ? 'Conectado a RED WIIIL: ya se ven sus productos' : `Conectado a RED WIIIL: ${names.length} productos`, products: names.length, sample: names.slice(0, 4) };
  } catch {
    return fail('No se pudo conectar con RED WIIIL (¿está encendido y la dirección es correcta?)');
  }
}
