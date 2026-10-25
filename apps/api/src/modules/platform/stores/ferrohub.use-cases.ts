import { Inject, Injectable, Optional } from '@nestjs/common';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../infra/realtime/realtime-publisher.port';
import type { FerrohubConnectResult, FerrohubProvisionRequest, FerrohubProvisionResult, FerrohubSsoResult } from '@parla/types';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';
import { ConflictError, NotFoundError, TooManyRequestsError, UnauthorizedError, ValidationError } from '../../../kernel/domain-error';
import { AUTH_REPOSITORY, type AuthRepository } from '../identity/auth/auth.repository';
import { BUSINESSES_REPOSITORY, NO_API, type BusinessesRepository, type BusinessRecord } from '../services/businesses.repository';
import { rejectIfSupport } from '../services/use-cases/claims.use-cases';
import { FERROHUB_CLIENT, type FerrohubClient, type FerrohubStoreInfo } from './ferrohub.client';
import { testStoreConnection } from './store-connection';
import { toBusinessInfo } from './stores.use-cases';

/** Letras y números sin 0, O, 1 ni I (se confunden al escribir). */
const CODE_BODY = '[A-HJ-NP-Z2-9]{4}';
const CODE_RE = new RegExp(`^FH-${CODE_BODY}-${CODE_BODY}$`);

/** «fh 7k3m 92qx», «FH7K392QX» o «FH-7K3M-92QX» → «FH-7K3M-92QX»; si no es un código válido, avisa cómo es. */
export function normalizeFerrohubCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith('FH') ? compact.slice(2) : compact;
  const code = body.length === 8 ? `FH-${body.slice(0, 4)}-${body.slice(4)}` : '';
  if (!CODE_RE.test(code)) throw new ValidationError('Escribe el código como aparece en FerroHub: FH-XXXX-XXXX (sin 0, O, 1 ni I).');
  return code;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

/** Tras 5 intentos fallidos en un minuto, la persona espera (el código se adivina menos así). */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  assertAllowed(key: string, now = Date.now()): void {
    const recent = (this.failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    this.failures.set(key, recent);
    if (recent.length >= MAX_FAILURES) throw new TooManyRequestsError('Demasiados intentos con el código. Espera 1 minuto e inténtalo de nuevo.');
  }

  fail(key: string, now = Date.now()): void {
    this.failures.set(key, [...(this.failures.get(key) ?? []), now]);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

/** Dirección que FerroHub usa para avisar a Parla de cambios en la tienda (firmados con el secreto de esa tienda). */
export const webhookUrlFor = (env: AppEnv, storeId: string): string =>
  `${(process.env.FERROHUB_WEBHOOK_BASE || env.publicWebUrl).replace(/\/$/, '')}/api/stores/${storeId}/ferrohub-events`;

/** Hora de apertura y cierre con el formato de Parla (HH:MM); si no sirven, quedan las de siempre. */
const validTime = (value: string | undefined, fallback: string): string => (value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback);

/** La ficha de la tienda en FerroHub ya trae dirección y ubicación (si la dueña la configuró allá). */
export const isStoreConfigured = (b: BusinessRecord): boolean => b.location !== null && b.address.trim().length >= 6 && b.address !== 'Por confirmar';

/** Una tienda «provisional» para tener su id mientras se canjea el código; si falla, se borra. */
async function ownOrProvisional(businesses: BusinessesRepository, userId: string): Promise<{ business: BusinessRecord; created: boolean }> {
  const existing = await businesses.findByOwner(userId);
  if (existing?.connector) throw new ConflictError('Tu tienda ya está conectada a FerroHub. Desvincúlala primero si quieres conectar otra.');
  if (existing) return { business: existing, created: false };
  const business = await businesses.create({
    name: 'Mi ferretería',
    service: 'ferreteria',
    description: '',
    ownerId: userId,
    address: 'Por confirmar',
    location: null,
    opensAt: '08:00',
    closesAt: '22:00',
  });
  return { business, created: true };
}

/** Con la ficha de FerroHub, precarga los datos de la tienda (la persona solo revisa y confirma). */
async function applyStoreInfo(businesses: BusinessesRepository, business: BusinessRecord, info: FerrohubStoreInfo | null, fallbackName: string): Promise<BusinessRecord> {
  const branch = info?.sucursales[0];
  return businesses.update(business.id, {
    name: info?.nombre || fallbackName,
    ...(branch?.direccion ? { address: branch.direccion } : {}),
    ...(branch && branch.lat !== null && branch.lng !== null ? { location: { lat: branch.lat, lng: branch.lng } } : {}),
    opensAt: validTime(info?.horario?.abre, business.opensAt),
    closesAt: validTime(info?.horario?.cierra, business.closesAt),
    ...(info && !info.aceptaPedidos ? { acceptingOrders: false } : {}),
  });
}

/**
 * «Conectar mi tienda» con un código de enlace de FerroHub (FH-XXXX-XXXX). El dueño no pega direcciones ni llaves:
 * Parla canjea el código, prueba que puede leer los productos, precarga los datos de la tienda y la deja lista.
 * Una tienda con estado «activa» en FerroHub llega ya verificada y aprobada; las demás pasan a revisión de soporte.
 */
@Injectable()
export class ConnectFerrohubUseCase {
  private readonly limiter = new AttemptLimiter();

  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(FERROHUB_CLIENT) private readonly client: FerrohubClient,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async execute(userId: string, rawCode: string): Promise<FerrohubConnectResult> {
    await rejectIfSupport(this.users, userId, 'abrir una tienda');
    const code = normalizeFerrohubCode(rawCode);
    this.limiter.assertAllowed(userId);
    const { business, created } = await ownOrProvisional(this.businesses, userId);
    const webhookSecret = randomBytes(32).toString('hex');
    try {
      const redeemed = await this.client.redeem({ code, parlaStoreId: business.id, parlaStoreName: business.name, webhookUrl: webhookUrlFor(this.env, business.id), webhookSecret });
      const probe = await testStoreConnection({ baseUrl: redeemed.apiBaseUrl, prefix: '', apiKey: redeemed.apiKey, format: 'redwiiil' });
      if (!probe.ok) throw new ConflictError(`Se canjeó el código, pero Parla no pudo leer tus productos (${probe.message}). Genera otro código e inténtalo de nuevo.`);
      const info = await this.client.storeInfo(redeemed.apiBaseUrl, redeemed.apiKey);
      this.limiter.reset(userId);

      let updated = await applyStoreInfo(this.businesses, business, info, redeemed.tienda.nombre);
      updated = await this.businesses.setSource(updated.id, 'api', { format: 'redwiiil', baseUrl: redeemed.apiBaseUrl, prefix: '', apiKey: redeemed.apiKey, adminKey: '' });
      // Los umbrales de «pedido grande» y el WhatsApp del administrador son los que la ferretería definió en FerroHub (S/ → céntimos).
      if (info) {
        updated = await this.businesses.setBigOrderRules(updated.id, { totalCents: Math.round(info.umbralPedidoGrande * 100), units: Math.round(info.umbralUnidades), whatsapp: info.whatsappAdmin ?? '' });
      }
      const verified = info?.estado === 'activa';
      updated = await this.businesses.setConnector(updated.id, { kind: 'ferrohub', origin: 'code', tenantId: info?.tenantId ?? '', webhookSecret, connectedAt: new Date(), verifiedAt: verified ? new Date() : null });
      // Verificada por FerroHub: se aprueba sola. Las demás esperan a soporte (que puede suspenderla siempre).
      if (verified && updated.status !== 'approved') {
        updated = await this.businesses.setReview(updated.id, { status: 'approved', reviewNote: 'Verificada por FerroHub', reviewedById: 'ferrohub' });
      }
      return { business: toBusinessInfo(updated), storeName: updated.name, products: probe.products, sample: probe.sample, verified };
    } catch (error) {
      this.limiter.fail(userId);
      if (created) await this.businesses.remove(business.id);
      throw error;
    }
  }
}

/**
 * «Crear mi ferretería»: Parla le pide a FerroHub que cree la ferretería (plan Semilla, en prueba) con los datos de la
 * persona y la deja ya conectada: sin segunda cuenta ni llaves. Devuelve el enlace de un solo uso al panel del dueño.
 */
@Injectable()
export class ProvisionFerrohubUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(FERROHUB_CLIENT) private readonly client: FerrohubClient,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async execute(userId: string, input: FerrohubProvisionRequest): Promise<FerrohubProvisionResult> {
    await rejectIfSupport(this.users, userId, 'abrir una tienda');
    const name = input.name.trim();
    const city = input.city.trim();
    if (name.length < 3 || city.length < 2) throw new ValidationError('Escribe el nombre de la ferretería y su ciudad.');
    if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new ValidationError('Escribe un correo válido.');
    const phone = input.phone.replace(/\D/g, '');
    if (phone.length < 8) throw new ValidationError('Escribe un celular válido.');

    const { business, created } = await ownOrProvisional(this.businesses, userId);
    const webhookSecret = randomBytes(32).toString('hex');
    let tenantId: string | null = null;
    try {
      const made = await this.client.provision({
        owner: { parlaUserId: userId, nombre: input.ownerName.trim() || name, email: input.email.trim().toLowerCase(), telefono: phone },
        tienda: { nombre: name, ciudad: city, ruc: input.ruc?.trim() ?? '', rubros: (input.categories ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 20) },
        parla: { parlaStoreId: business.id, webhookUrl: webhookUrlFor(this.env, business.id), webhookSecret },
      });
      tenantId = made.tenantId;
      // La ciudad solo va a FerroHub (segmentación): la dirección exacta la configura la dueña allá y Parla la lee.
      let updated = await this.businesses.update(business.id, { name, description: '' });
      updated = await this.businesses.setSource(updated.id, 'api', { format: 'redwiiil', baseUrl: made.apiBaseUrl, prefix: '', apiKey: made.apiKey, adminKey: '' });
      updated = await this.businesses.setConnector(updated.id, { kind: 'ferrohub', origin: 'provision', tenantId: made.tenantId, webhookSecret, connectedAt: new Date(), verifiedAt: null });
      return { business: toBusinessInfo(updated), ssoUrl: made.ssoUrl };
    } catch (error) {
      // Nada a medias: se deshace la ferretería recién creada y la tienda provisional.
      if (tenantId) await this.client.deprovision(tenantId);
      if (created) await this.businesses.remove(business.id);
      throw error;
    }
  }
}

/** «Abrir mi panel FerroHub»: un enlace nuevo (un solo uso, dura 60 s) para entrar sin contraseña. */
@Injectable()
export class FerrohubSsoUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(FERROHUB_CLIENT) private readonly client: FerrohubClient,
  ) {}

  async execute(userId: string): Promise<FerrohubSsoResult> {
    const business = await this.businesses.findByOwner(userId);
    if (!business?.connector?.tenantId) throw new NotFoundError('Tu tienda no está conectada a un panel de FerroHub.');
    return { url: (await this.client.sso(business.connector.tenantId, userId)).ssoUrl };
  }
}

/**
 * «Actualizar desde FerroHub»: los datos de la tienda (nombre, dirección, ubicación, horario, si acepta pedidos) se
 * configuran en FerroHub; Parla solo los lee. Se llama al entrar a «Mi negocio» y cuando FerroHub avisa un cambio.
 */
@Injectable()
export class SyncFerrohubStoreUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(FERROHUB_CLIENT) private readonly client: FerrohubClient,
    @Optional() @Inject(REALTIME_PUBLISHER) private readonly realtime?: RealtimePublisher,
  ) {}

  async execute(userId: string): Promise<ReturnType<typeof toBusinessInfo>> {
    const business = await this.businesses.findByOwner(userId);
    if (!business?.connector) throw new NotFoundError('Tu tienda no está conectada a FerroHub.');
    const info = toBusinessInfo(await this.syncBusiness(business));
    this.realtime?.toUsers([userId], 'business:updated', info);
    return info;
  }

  async syncBusiness(business: BusinessRecord): Promise<BusinessRecord> {
    if (!business.api.baseUrl || !business.api.apiKey) return business;
    const info = await this.client.storeInfo(business.api.baseUrl, business.api.apiKey);
    if (!info) return business;
    let updated = await applyStoreInfo(this.businesses, business, info, business.name);
    updated = await this.businesses.setBigOrderRules(updated.id, { totalCents: Math.round(info.umbralPedidoGrande * 100), units: Math.round(info.umbralUnidades), whatsapp: info.whatsappAdmin ?? '' });
    // Si FerroHub dice que acepta pedidos y Parla la tenía pausada por falta de configuración, se reanuda.
    if (info.aceptaPedidos && !updated.acceptingOrders) updated = await this.businesses.update(updated.id, { acceptingOrders: true });
    return updated;
  }
}

/** «Desvincular»: borra la llave, avisa a la ferretería y la tienda vuelve al catálogo de Parla. */
@Injectable()
export class DisconnectFerrohubUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(FERROHUB_CLIENT) private readonly client: FerrohubClient,
  ) {}

  async execute(userId: string): Promise<ReturnType<typeof toBusinessInfo>> {
    const business = await this.businesses.findByOwner(userId);
    if (!business?.connector) throw new NotFoundError('Tu tienda no está conectada a FerroHub.');
    if (business.api.baseUrl && business.api.apiKey) await this.client.unlink(business.api.baseUrl, business.api.apiKey, business.id);
    await this.businesses.setSource(business.id, 'native', NO_API);
    return toBusinessInfo(await this.businesses.setConnector(business.id, null));
  }
}

/** Un aviso de FerroHub: lo que dice el cuerpo firmado. */
interface FerrohubEvent {
  eventId?: string;
  tipo?: string;
}

const MAX_AGE_MS = 5 * 60_000;
const SEEN_LIMIT = 5_000;

/**
 * Avisos de FerroHub hacia Parla (webhook). Se aceptan solo con la firma `x-ferrohub-signature` =
 * HMAC-SHA256(secreto de esa tienda, cuerpo) y una marca de tiempo de los últimos 5 minutos; cada `eventId` cuenta una vez.
 */
@Injectable()
export class FerrohubWebhookUseCase {
  private readonly seen = new Set<string>();

  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(FERROHUB_CLIENT) private readonly client: FerrohubClient,
    @Optional() @Inject(REALTIME_PUBLISHER) private readonly realtime?: RealtimePublisher,
  ) {}

  async execute(storeId: string, raw: string, signature: string | undefined, timestamp: string | undefined, now = Date.now()): Promise<{ ok: true; duplicate?: boolean }> {
    const business = await this.businesses.findById(storeId);
    const secret = business?.connector?.webhookSecret;
    // Misma respuesta para «no existe» y «firma mala»: no se revela qué tiendas existen.
    if (!business || !secret) throw new UnauthorizedError('Aviso no autorizado');
    const sentAt = Number(timestamp) > 1e12 ? Number(timestamp) : Number(timestamp) * 1000;
    if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > MAX_AGE_MS) throw new UnauthorizedError('Aviso vencido');
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const given = Buffer.from((signature ?? '').replace(/^sha256=/, ''), 'hex');
    const wanted = Buffer.from(expected, 'hex');
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new UnauthorizedError('Aviso no autorizado');

    let event: FerrohubEvent;
    try {
      event = JSON.parse(raw) as FerrohubEvent;
    } catch {
      throw new ValidationError('El aviso no es un JSON válido');
    }
    if (event.eventId) {
      if (this.seen.has(event.eventId)) return { ok: true, duplicate: true };
      this.seen.add(event.eventId);
      if (this.seen.size > SEEN_LIMIT) this.seen.delete(this.seen.values().next().value as string);
    }

    switch (event.tipo) {
      case 'desvinculada':
        await this.businesses.setSource(business.id, 'native', NO_API);
        await this.businesses.setConnector(business.id, null);
        await this.businesses.update(business.id, { acceptingOrders: false });
        await this.notifyOwner(business.id);
        break;
      case 'tienda.actualizada':
        // Cambió algo de la tienda en FerroHub (nombre, dirección, horario…): se vuelve a leer su ficha.
        await new SyncFerrohubStoreUseCase(this.businesses, this.client).syncBusiness(business);
        await this.notifyOwner(business.id);
        break;
      case 'tienda.cerrada':
        await this.businesses.update(business.id, { acceptingOrders: false });
        await this.notifyOwner(business.id);
        break;
      case 'tienda.abierta':
        await this.businesses.update(business.id, { acceptingOrders: true });
        await this.notifyOwner(business.id);
        break;
      case 'producto.actualizado':
      case 'producto.agotado':
        // El catálogo se consulta en vivo. El primer producto de una ferretería creada desde Parla («Crear mi ferretería»)
        // la publica sola; las conectadas con código pasan por la revisión de soporte.
        if (business.status === 'pending' && business.connector?.origin === 'provision' && business.reviewNote === '') {
          await this.businesses.setReview(business.id, { status: 'approved', reviewNote: '', reviewedById: 'ferrohub' });
        }
        break;
      default:
        break;
    }
    return { ok: true };
  }

  /** El dueño ve el cambio al instante, sin recargar. */
  private async notifyOwner(businessId: string): Promise<void> {
    const fresh = await this.businesses.findById(businessId);
    if (fresh) this.realtime?.toUsers([fresh.ownerId], 'business:updated', toBusinessInfo(fresh));
  }
}
