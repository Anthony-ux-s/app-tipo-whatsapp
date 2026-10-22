import { Inject, Injectable } from '@nestjs/common';
import type { AdminIntegration, IntegrableService, IntegrationFormat, IntegrationTestResult, UpdateIntegrationRequest } from '@parla/types';
import { ValidationError } from '../../../../kernel/domain-error';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { INTEGRATIONS_REPOSITORY, type IntegrationRecord, type IntegrationsRepository } from '../integrations.repository';
import { requireAdmin } from './claims.use-cases';

export const INTEGRABLE_SERVICES: IntegrableService[] = ['tecnologia', 'ferreteria', 'salud'];

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
export function formatFor(apiKey: string, chosen?: IntegrationFormat, current: IntegrationFormat = 'parla'): IntegrationFormat {
  if (chosen) return chosen;
  return apiKey.startsWith('wiiil_') ? 'redwiiil' : current;
}

/** RED WIIIL publica su API en la raíz del sitio (/api/v1): de «…/admin/inventory» queda solo el origen. */
export function baseUrlFor(format: IntegrationFormat, baseUrl: string): string {
  if (format !== 'redwiiil' || !baseUrl) return baseUrl;
  return new URL(baseUrl).origin;
}

export function normalizePrefix(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  // «tienda/v1» se entiende como «/tienda/v1».
  const value = trimmed && !trimmed.startsWith('/') ? `/${trimmed}` : trimmed;
  if (value && !PREFIX.test(value)) throw new ValidationError('La ruta de la API solo lleva letras, números, «-», «.» y «/» (p. ej. /tecnoya/v1)');
  return value;
}

/** Lo que ve soporte: sin las claves completas. */
function toAdmin(r: IntegrationRecord, updatedByName: string | null): AdminIntegration {
  return {
    service: r.service,
    name: r.name,
    format: r.format,
    enabled: r.enabled,
    baseUrl: r.baseUrl,
    prefix: r.prefix,
    apiKeySet: !!r.apiKey,
    apiKeyHint: r.apiKey ? `••••${r.apiKey.slice(-4)}` : null,
    adminKeySet: !!r.adminKey,
    updatedAt: r.updatedAt?.toISOString() ?? null,
    updatedByName,
  };
}

/** Soporte: las integraciones de los servicios (Tecnología, Salud). */
@Injectable()
export class ListIntegrationsUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(INTEGRATIONS_REPOSITORY) private readonly integrations: IntegrationsRepository,
  ) {}

  async execute(adminId: string): Promise<AdminIntegration[]> {
    await requireAdmin(this.users, adminId);
    const records = await Promise.all(INTEGRABLE_SERVICES.map((s) => this.integrations.get(s)));
    const editors = await this.users.findActiveByIds([...new Set(records.map((r) => r.updatedById).filter((id): id is string => !!id))]);
    const names = new Map(editors.map((u) => [u.id, u.displayName]));
    return records.map((r) => toAdmin(r, r.updatedById ? (names.get(r.updatedById) ?? null) : null));
  }
}

/** Soporte conecta (o cambia, o apaga) la API de tienda de un servicio. */
@Injectable()
export class UpdateIntegrationUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(INTEGRATIONS_REPOSITORY) private readonly integrations: IntegrationsRepository,
  ) {}

  async execute(adminId: string, service: IntegrableService, input: UpdateIntegrationRequest): Promise<AdminIntegration> {
    await requireAdmin(this.users, adminId);
    const current = await this.integrations.get(service);
    const apiKey = input.clearApiKey ? '' : input.apiKey?.trim() || current.apiKey;
    const adminKey = input.clearAdminKey ? '' : input.adminKey?.trim() || current.adminKey;
    const format = formatFor(apiKey, input.format, current.format);
    const baseUrl = baseUrlFor(format, normalizeBaseUrl(input.baseUrl));
    if (input.enabled && !baseUrl) throw new ValidationError('Para encenderlo, escribe la URL de la API');
    const saved = await this.integrations.save(
      service,
      { name: input.name.trim().slice(0, 60), format, enabled: input.enabled, baseUrl, prefix: format === 'redwiiil' ? '' : normalizePrefix(input.prefix), apiKey, adminKey },
      adminId,
    );
    const [me] = await this.users.findActiveByIds([adminId]);
    return toAdmin(saved, me?.displayName ?? null);
  }
}

interface StoreCatalogBody {
  resultados?: { nombre?: string }[];
  error?: string;
}

/**
 * «Probar conexión»: pide el catálogo a la API de la tienda con la URL y la clave que se están
 * editando (o las guardadas) y cuenta cuántos productos devuelve.
 */
@Injectable()
export class TestIntegrationUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(INTEGRATIONS_REPOSITORY) private readonly integrations: IntegrationsRepository,
  ) {}

  async execute(adminId: string, service: IntegrableService, input: Pick<UpdateIntegrationRequest, 'baseUrl' | 'prefix' | 'apiKey' | 'format'>): Promise<IntegrationTestResult> {
    await requireAdmin(this.users, adminId);
    const current = await this.integrations.get(service);
    const apiKey = input.apiKey?.trim() || current.apiKey;
    const format = formatFor(apiKey, input.format, current.format);
    const baseUrl = baseUrlFor(format, normalizeBaseUrl(input.baseUrl));
    if (!baseUrl) throw new ValidationError('Escribe la URL de la API');
    if (format === 'redwiiil') return testRedWiiil(baseUrl, apiKey);
    const prefix = normalizePrefix(input.prefix) || '/mercaya/v1';
    try {
      const res = await fetch(`${baseUrl}${prefix}/catalogo?buscar=`, {
        headers: { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
        // Sin seguir redirecciones: una página web que manda a iniciar sesión no es la API.
        redirect: 'manual',
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
      if (res.status >= 300 && res.status < 400) {
        const to = res.headers.get('location') ?? '';
        const login = /login|signin|ingresar|auth/i.test(to);
        return {
          ok: false,
          message: login
            ? 'Esa dirección es la página web de la tienda (te manda a iniciar sesión), no su API. Pide a la tienda la dirección de su API.'
            : `Esa dirección redirige a otra página${to ? ` (${to})` : ''}: no es la API. Pide a la tienda la dirección de su API.`,
          products: 0,
          sample: [],
        };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'La tienda rechazó la clave de API', products: 0, sample: [] };
      if (res.status === 404) return { ok: false, message: 'Esa dirección existe, pero no tiene el catálogo donde Parla lo busca: la API de la tienda usa otro formato o la ruta no es la correcta.', products: 0, sample: [] };
      if (!res.ok) return { ok: false, message: `La API respondió ${res.status}: revisa la dirección y la ruta`, products: 0, sample: [] };
      if (!(res.headers.get('content-type') ?? '').includes('json')) {
        return { ok: false, message: 'Esa dirección devolvió una página web, no datos de una API. Pide a la tienda la dirección de su API.', products: 0, sample: [] };
      }
      const body = (await res.json()) as StoreCatalogBody;
      if (!Array.isArray(body.resultados)) return { ok: false, message: 'La respuesta no tiene el formato de la API de tienda (falta «resultados»)', products: 0, sample: [] };
      const names = body.resultados.map((p) => p.nombre).filter((n): n is string => typeof n === 'string');
      return { ok: true, message: `Conectado: ${names.length} productos en el catálogo`, products: names.length, sample: names.slice(0, 4) };
    } catch {
      return { ok: false, message: 'No se pudo conectar con la API (¿la URL es correcta y está en línea?)', products: 0, sample: [] };
    }
  }
}

interface RedWiiilBody {
  data?: { nombre?: string }[];
  siguiente?: string | null;
  error?: { code?: string; message?: string };
}

/** Prueba la API v1 de RED WIIIL (GET /api/v1/products con la llave en Authorization: Bearer). */
async function testRedWiiil(baseUrl: string, apiKey: string): Promise<IntegrationTestResult> {
  if (!apiKey) return { ok: false, message: 'Pega la llave de RED WIIIL (empieza con «wiiil_»)', products: 0, sample: [] };
  try {
    const res = await fetch(`${baseUrl}/api/v1/products?limit=5`, {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as RedWiiilBody;
    const reason = body.error?.message;
    if (res.status === 401) return { ok: false, message: `RED WIIIL no reconoce esa llave${reason ? `: ${reason}` : ''}`, products: 0, sample: [] };
    if (res.status === 403) return { ok: false, message: `La llave está desactivada o no tiene permiso para ver productos${reason ? `: ${reason}` : ''}`, products: 0, sample: [] };
    if (res.status === 404) return { ok: false, message: 'En esa dirección no está la API de RED WIIIL (/api/v1). Revisa la dirección del sistema.', products: 0, sample: [] };
    if (!res.ok || !Array.isArray(body.data)) return { ok: false, message: `RED WIIIL respondió ${res.status}${reason ? `: ${reason}` : ''}`, products: 0, sample: [] };
    const names = body.data.map((p) => p.nombre).filter((n): n is string => typeof n === 'string');
    return { ok: true, message: body.siguiente ? 'Conectado a RED WIIIL: ya se ven sus productos' : `Conectado a RED WIIIL: ${names.length} productos`, products: names.length, sample: names.slice(0, 4) };
  } catch {
    return { ok: false, message: 'No se pudo conectar con RED WIIIL (¿está encendido y la dirección es correcta?)', products: 0, sample: [] };
  }
}

/** Para el gateway: la integración completa, con las claves (solo por la ruta interna). */
@Injectable()
export class GetInternalIntegrationUseCase {
  constructor(@Inject(INTEGRATIONS_REPOSITORY) private readonly integrations: IntegrationsRepository) {}

  async execute(service: IntegrableService): Promise<IntegrationRecord> {
    return this.integrations.get(service);
  }
}
