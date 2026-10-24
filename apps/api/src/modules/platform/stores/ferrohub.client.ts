import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';
import { ConflictError, NotFoundError, TooManyRequestsError, ValidationError } from '../../../kernel/domain-error';

const TIMEOUT_MS = 6_000;

/** Ficha de la ferretería (GET /api/v1/store-info). Todo es opcional: una API más vieja puede no tenerla. */
export interface FerrohubStoreInfo {
  nombre: string;
  aceptaPedidos: boolean;
  whatsappAdmin: string | null;
  umbralPedidoGrande: number;
  umbralUnidades: number;
  horario: { abre: string; cierra: string; dias: string[] } | null;
  sucursales: { nombre: string; direccion: string; lat: number | null; lng: number | null }[];
  /** «activa» = FerroHub ya validó RUC y estado; cualquier otra cosa (prueba, suspendida) pasa a revisión. */
  estado: string | null;
  tenantId: string | null;
}

export interface FerrohubRedeemInput {
  code: string;
  parlaStoreId: string;
  parlaStoreName: string;
  webhookUrl: string;
  webhookSecret: string;
}

export interface FerrohubRedeemResult {
  apiBaseUrl: string;
  apiKey: string;
  permisos: string[];
  tienda: { nombre: string; sucursal: string | null };
}

export interface FerrohubProvisionInput {
  owner: { parlaUserId: string; nombre: string; email: string; telefono: string };
  tienda: { nombre: string; ciudad: string; ruc: string; rubros: string[] };
  parla: { parlaStoreId: string; webhookUrl: string; webhookSecret: string };
}

export interface FerrohubProvisionResult {
  tenantId: string;
  plan: string;
  estado: string;
  apiBaseUrl: string;
  apiKey: string;
  ssoUrl: string;
  ssoExpiraEn: number;
}

/** Lo que Parla le pide a FerroHub. Se inyecta para poder probarlo sin red. */
export interface FerrohubClient {
  redeem(input: FerrohubRedeemInput): Promise<FerrohubRedeemResult>;
  storeInfo(apiBaseUrl: string, apiKey: string): Promise<FerrohubStoreInfo | null>;
  provision(input: FerrohubProvisionInput): Promise<FerrohubProvisionResult>;
  sso(tenantId: string, parlaUserId: string): Promise<{ ssoUrl: string }>;
  /** Avisa a la ferretería que se desvinculó (si ya no responde, no importa). */
  unlink(apiBaseUrl: string, apiKey: string, parlaStoreId: string): Promise<void>;
  /** Deshace un alta directa que quedó a medias. */
  deprovision(tenantId: string): Promise<void>;
}

export const FERROHUB_CLIENT = Symbol('FERROHUB_CLIENT');

interface ErrorBody {
  error?: string | { code?: string; message?: string };
  codigo?: string;
  message?: string;
}

const codeOf = (body: ErrorBody): string => (typeof body.error === 'string' ? body.error : (body.error?.code ?? body.codigo ?? ''));
const messageOf = (body: ErrorBody): string => body.message ?? (typeof body.error === 'object' ? (body.error?.message ?? '') : '');

/** Cliente HTTP de la plataforma FerroHub (`FERROHUB_API_URL`; las llamadas de plataforma llevan `x-parla-platform-key`). */
@Injectable()
export class HttpFerrohubClient implements FerrohubClient {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  private get platformUrl(): string {
    return this.env.ferrohub.apiUrl;
  }

  private platformHeaders(): Record<string, string> {
    const key = this.env.ferrohub.platformKey;
    return { 'content-type': 'application/json', accept: 'application/json', ...(key ? { 'x-parla-platform-key': key } : {}) };
  }

  /** Una llamada con tiempo límite. `retry` solo para lo que se puede repetir sin efectos (no canjear un código). */
  private async call(url: string, init: RequestInit, retry: boolean): Promise<{ status: number; body: unknown }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt += 1) {
      try {
        const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status >= 500 && retry && attempt === 0) continue;
        const body = await res.json().catch(() => ({}));
        return { status: res.status, body };
      } catch (error) {
        lastError = error;
      }
    }
    void lastError;
    throw new ConflictError('FerroHub no responde en este momento. Inténtalo de nuevo en un minuto.');
  }

  async redeem(input: FerrohubRedeemInput): Promise<FerrohubRedeemResult> {
    const { status, body } = await this.call(
      `${this.platformUrl}/v1/connect/redeem`,
      { method: 'POST', headers: this.platformHeaders(), body: JSON.stringify(input) },
      false,
    );
    if (status === 200) return normalizeRedeem(body);
    const err = body as ErrorBody;
    const code = codeOf(err);
    if (status === 404 || code === 'codigo_invalido') throw new NotFoundError('No existe ese código. Revisa que sea FH-XXXX-XXXX, tal como lo ves en FerroHub.');
    if (status === 410 && (code === 'codigo_usado' || /usado/i.test(code))) throw new ConflictError('Ese código ya se usó. Genera uno nuevo en FerroHub.');
    if (status === 410) throw new ConflictError('Ese código venció (dura 10 minutos). Genera uno nuevo en FerroHub.');
    if (status === 429) throw new TooManyRequestsError('Demasiados intentos con el código. Espera 1 minuto e inténtalo de nuevo.');
    throw new ConflictError(messageOf(err) || `FerroHub respondió ${status}. Inténtalo de nuevo.`);
  }

  async storeInfo(apiBaseUrl: string, apiKey: string): Promise<FerrohubStoreInfo | null> {
    try {
      const { status, body } = await this.call(`${apiBaseUrl}/api/v1/store-info`, { headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` } }, true);
      if (status !== 200) return null;
      return normalizeStoreInfo(body);
    } catch {
      return null;
    }
  }

  async provision(input: FerrohubProvisionInput): Promise<FerrohubProvisionResult> {
    const { status, body } = await this.call(`${this.platformUrl}/v1/provision`, { method: 'POST', headers: this.platformHeaders(), body: JSON.stringify(input) }, true);
    if (status === 200 || status === 201) return normalizeProvision(body);
    const err = body as ErrorBody;
    const code = codeOf(err);
    if (status === 409 || code === 'correo_en_uso') {
      throw new ConflictError(messageOf(err) || 'Ese correo ya está en uso con otra ferretería de FerroHub. Conéctala con un código.');
    }
    if (status === 400 || status === 422) throw new ValidationError(messageOf(err) || 'FerroHub no aceptó los datos de la ferretería. Revísalos.');
    throw new ConflictError(messageOf(err) || `FerroHub respondió ${status}. Inténtalo de nuevo.`);
  }

  async sso(tenantId: string, parlaUserId: string): Promise<{ ssoUrl: string }> {
    const { status, body } = await this.call(`${this.platformUrl}/v1/sso`, { method: 'POST', headers: this.platformHeaders(), body: JSON.stringify({ tenantId, parlaUserId }) }, true);
    const url = (body as { ssoUrl?: unknown }).ssoUrl;
    if (status !== 200 || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new ConflictError(messageOf(body as ErrorBody) || 'No se pudo abrir tu panel de FerroHub ahora. Inténtalo en un momento.');
    }
    return { ssoUrl: url };
  }

  async unlink(apiBaseUrl: string, apiKey: string, parlaStoreId: string): Promise<void> {
    try {
      await this.call(`${apiBaseUrl}/v1/connect/${encodeURIComponent(parlaStoreId)}`, { method: 'DELETE', headers: { accept: 'application/json', authorization: `Bearer ${apiKey}`, ...this.platformHeaders() } }, false);
    } catch {
      // Se desvincula igual en Parla: la ferretería verá la llave sin uso.
    }
  }

  async deprovision(tenantId: string): Promise<void> {
    try {
      await this.call(`${this.platformUrl}/v1/provision/${encodeURIComponent(tenantId)}`, { method: 'DELETE', headers: this.platformHeaders() }, false);
    } catch {
      // Si no se pudo deshacer, soporte de FerroHub lo verá en estado «prueba» sin ventas.
    }
  }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function originOf(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocolo');
    return url.origin;
  } catch {
    throw new ConflictError('FerroHub respondió con una dirección de API que no es válida.');
  }
}

function normalizeRedeem(body: unknown): FerrohubRedeemResult {
  const b = body as Record<string, unknown>;
  const apiKey = str(b.apiKey);
  if (!apiKey) throw new ConflictError('FerroHub no entregó la llave de la tienda. Genera otro código.');
  const tienda = (b.tienda ?? {}) as Record<string, unknown>;
  return {
    apiBaseUrl: originOf(str(b.apiBaseUrl)),
    apiKey,
    permisos: Array.isArray(b.permisos) ? b.permisos.filter((p): p is string => typeof p === 'string') : [],
    tienda: { nombre: str(tienda.nombre, 'Mi ferretería'), sucursal: str(tienda.sucursal) || null },
  };
}

function normalizeProvision(body: unknown): FerrohubProvisionResult {
  const b = body as Record<string, unknown>;
  const apiKey = str(b.apiKey);
  const tenantId = str(b.tenantId);
  if (!apiKey || !tenantId) throw new ConflictError('FerroHub no terminó de crear la ferretería. Inténtalo de nuevo.');
  return {
    tenantId,
    plan: str(b.plan, 'semilla'),
    estado: str(b.estado, 'prueba'),
    apiBaseUrl: originOf(str(b.apiBaseUrl)),
    apiKey,
    ssoUrl: str(b.ssoUrl),
    ssoExpiraEn: num(b.ssoExpiraEn, 60),
  };
}

export function normalizeStoreInfo(body: unknown): FerrohubStoreInfo {
  const b = body as Record<string, unknown>;
  const horario = b.horario as Record<string, unknown> | undefined;
  const sucursales = Array.isArray(b.sucursales) ? (b.sucursales as Record<string, unknown>[]) : [];
  return {
    nombre: str(b.nombre),
    aceptaPedidos: b.aceptaPedidos !== false,
    whatsappAdmin: str(b.whatsappAdmin) || null,
    umbralPedidoGrande: num(b.umbralPedidoGrande, 600),
    umbralUnidades: num(b.umbralUnidades, 25),
    horario: horario && str(horario.abre) && str(horario.cierra) ? { abre: str(horario.abre), cierra: str(horario.cierra), dias: Array.isArray(horario.dias) ? horario.dias.map(String) : [] } : null,
    // La dirección y el punto del mapa que la dueña configuró en FerroHub vienen en la ficha (direccion, lat, lng). Si la
    // ficha los trae (aunque vacíos), manda ella: las sucursales de una tienda recién creada son direcciones de relleno.
    // Una API anterior solo manda las sucursales (con su lat/lng): entonces se usan esas.
    sucursales:
      'direccion' in b || 'lat' in b
        ? str(b.direccion) || typeof b.lat === 'number'
          ? [{ nombre: 'Principal', direccion: str(b.direccion), lat: typeof b.lat === 'number' ? b.lat : null, lng: typeof b.lng === 'number' ? b.lng : null }]
          : []
        : sucursales.map((s) => ({ nombre: str(s.nombre), direccion: str(s.direccion), lat: typeof s.lat === 'number' ? s.lat : null, lng: typeof s.lng === 'number' ? s.lng : null })),
    estado: str(b.estado) || null,
    tenantId: str(b.tenantId) || null,
  };
}
