import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminStore,
  BusinessInfo,
  ImportProductsResult,
  IntegrationTestResult,
  RegisterStoreRequest,
  ReviewStoreRequest,
  ServiceId,
  StoreCategoryInfo,
  StoreIntegrationInfo,
  StoreIntegrationInput,
  StoreProduct,
  StoreStatus,
  StoreSummary,
} from '@parla/types';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';
import { bigOrderRulesOf } from '../../../kernel/big-order';
import { businessStatus } from '../../../kernel/business-hours';
import { parsePhone } from '../../../kernel/phone';
import { ConflictError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { assertStoreRegistration, cleanProduct, MAX_IMPORT_ROWS, SERVICE_IDS } from '../../../kernel/store-rules';
import { AUTH_REPOSITORY, type AuthRepository } from '../identity/auth/auth.repository';
import { BUSINESSES_REPOSITORY, NO_API, type BusinessesRepository, type BusinessRecord, type StoreApiConfig } from '../services/businesses.repository';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../services/orders.repository';
import { rejectIfSupport, requireAdmin } from '../services/use-cases/claims.use-cases';
import { PRODUCTS_REPOSITORY, type ProductsRepository } from './products.repository';
import { baseUrlFor, formatFor, normalizeBaseUrl, normalizePrefix, testStoreConnection } from './store-connection';

const PRODUCTS_LIMIT = 500;

/** Lo que ve el dueño de su tienda. */
export function toBusinessInfo(b: BusinessRecord): BusinessInfo {
  return {
    id: b.id,
    name: b.name,
    service: b.service,
    description: b.description,
    address: b.address,
    phone: b.phone,
    location: b.location,
    status: b.status,
    reviewNote: b.reviewNote,
    source: b.source,
    acceptingOrders: b.acceptingOrders,
    opensAt: b.opensAt,
    closesAt: b.closesAt,
    connector: b.connector?.kind ?? null,
    verified: Boolean(b.connector?.verifiedAt),
  };
}

function toIntegrationInfo(b: BusinessRecord): StoreIntegrationInfo {
  return {
    source: b.source,
    format: b.api.format,
    baseUrl: b.api.baseUrl,
    prefix: b.api.prefix,
    apiKeySet: !!b.api.apiKey,
    apiKeyHint: b.api.apiKey ? `••••${b.api.apiKey.slice(-4)}` : null,
    adminKeySet: !!b.api.adminKey,
  };
}

/** Quien pide abrir una tienda: queda en revisión hasta que soporte la apruebe. */
@Injectable()
export class RegisterStoreUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
  ) {}

  async execute(userId: string, input: RegisterStoreRequest): Promise<BusinessInfo> {
    await rejectIfSupport(this.users, userId, 'abrir una tienda');
    assertStoreRegistration(input);
    if (await this.businesses.findByOwner(userId)) throw new ConflictError('Ya tienes una tienda en Parla');
    const created = await this.businesses.create({
      name: input.name.trim(),
      service: input.service,
      description: (input.description ?? '').trim(),
      ownerId: userId,
      address: input.address.trim(),
      phone: parsePhone(input.phone),
      location: input.location ?? null,
      opensAt: input.opensAt ?? '08:00',
      closesAt: input.closesAt ?? '22:00',
    });
    return toBusinessInfo(created);
  }
}

/** Las tiendas aprobadas de una categoría (o de todas), con si están abiertas y su calificación. */
@Injectable()
export class ListStoresUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(service: ServiceId | undefined, now = new Date()): Promise<StoreSummary[]> {
    if (service && !SERVICE_IDS.includes(service)) throw new ValidationError('Esa categoría no existe');
    const list = await this.businesses.list({ ...(service ? { service } : {}), status: 'approved' });
    // Una sola consulta para las calificaciones de todas las tiendas (no una por tienda).
    const ratings = await this.orders.ratingSummaries(list.map((b) => b.id));
    const summaries = await Promise.all(list.map((b) => this.summary(b, now, ratings.get(b.id) ?? { average: null, count: 0 })));
    // Primero las abiertas y mejor calificadas.
    return summaries.sort((a, b) => Number(b.open) - Number(a.open) || (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || a.name.localeCompare(b.name));
  }

  async summary(b: BusinessRecord, now: Date, known?: { average: number | null; count: number }): Promise<StoreSummary> {
    const rating = known ?? (await this.orders.ratingSummary({ businessId: b.id }));
    const st = businessStatus(b, now);
    return {
      id: b.id,
      name: b.name,
      service: b.service,
      description: b.description,
      address: b.address,
      phone: b.phone,
      location: b.location,
      open: st.open,
      closedMessage: st.closedMessage,
      opensAt: b.opensAt,
      closesAt: b.closesAt,
      ratingAvg: rating.count ? rating.average : null,
      ratingCount: rating.count,
      verified: Boolean(b.connector?.verifiedAt),
      bigOrder: bigOrderRulesOf(b),
    };
  }
}

@Injectable()
export class GetStoreUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    private readonly list: ListStoresUseCase,
  ) {}

  async execute(id: string, now = new Date()): Promise<StoreSummary> {
    const business = await this.businesses.findById(id);
    if (!business || business.status !== 'approved') throw new NotFoundError('Tienda no encontrada');
    return this.list.summary(business, now);
  }
}

@Injectable()
export class ListStoreCategoriesUseCase {
  constructor(@Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository) {}

  async execute(): Promise<StoreCategoryInfo[]> {
    const counts = await this.businesses.countApprovedByService();
    return SERVICE_IDS.map((service) => ({ service, stores: counts[service] ?? 0 }));
  }
}

async function ownStore(businesses: BusinessesRepository, userId: string): Promise<BusinessRecord> {
  const business = await businesses.findByOwner(userId);
  if (!business) throw new NotFoundError('No tienes una tienda en Parla');
  return business;
}

async function ownNativeStore(businesses: BusinessesRepository, userId: string): Promise<BusinessRecord> {
  const business = await ownStore(businesses, userId);
  if (business.source !== 'native') throw new ConflictError('Tu catálogo está en tu propio sistema. Para usar el de Parla, desconecta tu API.');
  return business;
}

/** Catálogo propio de la tienda del dueño. */
@Injectable()
export class ManageProductsUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository,
  ) {}

  async list(userId: string, query?: string): Promise<StoreProduct[]> {
    const business = await ownNativeStore(this.businesses, userId);
    return this.products.list(business.id, { query, onlyActive: false, limit: PRODUCTS_LIMIT });
  }

  async create(userId: string, input: StoreProduct): Promise<StoreProduct> {
    const business = await ownNativeStore(this.businesses, userId);
    const product = cleanProduct(input);
    if (!(await this.products.create(business.id, product))) throw new ConflictError(`Ya tienes un producto con el código «${product.sku}»`);
    return product;
  }

  async update(userId: string, sku: string, input: StoreProduct): Promise<StoreProduct> {
    const business = await ownNativeStore(this.businesses, userId);
    const product = cleanProduct({ ...input, sku });
    const saved = await this.products.update(business.id, sku, product);
    if (!saved) throw new NotFoundError('Ese producto no existe');
    return saved;
  }

  async remove(userId: string, sku: string): Promise<void> {
    const business = await ownNativeStore(this.businesses, userId);
    if (!(await this.products.delete(business.id, sku))) throw new NotFoundError('Ese producto no existe');
  }

  /** Importación masiva: las filas buenas se guardan y las malas se devuelven con su motivo. */
  async import(userId: string, rows: StoreProduct[]): Promise<ImportProductsResult> {
    const business = await ownNativeStore(this.businesses, userId);
    if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('No hay filas para importar');
    if (rows.length > MAX_IMPORT_ROWS) throw new ValidationError(`Envía hasta ${MAX_IMPORT_ROWS} filas por vez`);
    const errors: ImportProductsResult['errors'] = [];
    const valid = new Map<string, StoreProduct>();
    rows.forEach((row, index) => {
      try {
        const product = cleanProduct(row);
        // Si el archivo repite un código, vale la última fila.
        valid.set(product.sku, product);
      } catch (error) {
        errors.push({ row: index + 1, sku: String(row?.sku ?? ''), message: error instanceof ValidationError ? error.message : 'Fila inválida' });
      }
    });
    const saved = valid.size ? await this.products.upsertMany(business.id, [...valid.values()]) : { created: 0, updated: 0 };
    return { ...saved, errors };
  }
}

/** Conexión de la tienda con su propio sistema (su API). */
@Injectable()
export class ManageIntegrationUseCase {
  constructor(@Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository) {}

  async get(userId: string): Promise<StoreIntegrationInfo> {
    return toIntegrationInfo(await ownStore(this.businesses, userId));
  }

  /** Con URL, la tienda vende desde su API; con la URL vacía vuelve al catálogo de Parla. */
  async save(userId: string, input: StoreIntegrationInput): Promise<StoreIntegrationInfo> {
    const business = await ownStore(this.businesses, userId);
    if (!input.baseUrl.trim()) return toIntegrationInfo(await this.businesses.setSource(business.id, 'native', NO_API));
    const apiKey = input.clearApiKey ? '' : input.apiKey?.trim() || business.api.apiKey;
    const adminKey = input.clearAdminKey ? '' : input.adminKey?.trim() || business.api.adminKey;
    const format = formatFor(apiKey, input.format, business.api.format);
    const api: StoreApiConfig = { format, baseUrl: baseUrlFor(format, normalizeBaseUrl(input.baseUrl)), prefix: format === 'redwiiil' ? '' : normalizePrefix(input.prefix), apiKey, adminKey };
    return toIntegrationInfo(await this.businesses.setSource(business.id, 'api', api));
  }

  async test(userId: string, input: StoreIntegrationInput): Promise<IntegrationTestResult> {
    const business = await ownStore(this.businesses, userId);
    const apiKey = input.apiKey?.trim() || business.api.apiKey;
    const format = formatFor(apiKey, input.format, business.api.format);
    return testStoreConnection({ baseUrl: input.baseUrl, prefix: input.prefix, apiKey, format });
  }
}

/** Soporte: las tiendas con su dueño, por estado. */
@Injectable()
export class ListAdminStoresUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository,
  ) {}

  async execute(adminId: string, status?: StoreStatus): Promise<AdminStore[]> {
    await requireAdmin(this.users, adminId);
    const list = await this.businesses.list(status ? { status } : {});
    return this.toAdmin(list);
  }

  async toAdmin(list: BusinessRecord[]): Promise<AdminStore[]> {
    const owners = new Map((await this.users.findActiveByIds([...new Set(list.map((b) => b.ownerId))])).map((u) => [u.id, u]));
    const counts = await Promise.all(list.map((b) => (b.source === 'native' ? this.products.count(b.id) : Promise.resolve(0))));
    const stores = list.map<AdminStore>((b, i) => ({
      id: b.id,
      name: b.name,
      service: b.service,
      description: b.description,
      status: b.status,
      reviewNote: b.reviewNote,
      source: b.source,
      address: b.address,
      location: b.location,
      ownerId: b.ownerId,
      ownerName: owners.get(b.ownerId)?.displayName ?? 'Cuenta eliminada',
      ownerPhone: owners.get(b.ownerId)?.phone ?? null,
      createdAt: b.createdAt.toISOString(),
      productCount: counts[i],
      integration: toIntegrationInfo(b),
    }));
    // Pendientes primero: son las que esperan a soporte.
    const rank: Record<StoreStatus, number> = { pending: 0, suspended: 1, rejected: 2, approved: 3 };
    return stores.sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
  }
}

const NEXT: Record<ReviewStoreRequest['action'], { from: StoreStatus[]; to: StoreStatus; needsNote: boolean }> = {
  approve: { from: ['pending', 'rejected'], to: 'approved', needsNote: false },
  reject: { from: ['pending'], to: 'rejected', needsNote: true },
  suspend: { from: ['approved'], to: 'suspended', needsNote: true },
  reactivate: { from: ['suspended'], to: 'approved', needsNote: false },
};

/** Soporte aprueba, rechaza, suspende o reactiva una tienda (rechazar y suspender llevan motivo). */
@Injectable()
export class ReviewStoreUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    private readonly admin: ListAdminStoresUseCase,
  ) {}

  async execute(adminId: string, id: string, input: ReviewStoreRequest): Promise<AdminStore> {
    await requireAdmin(this.users, adminId);
    const step = NEXT[input.action];
    if (!step) throw new ValidationError('Acción no válida');
    const business = await this.businesses.findById(id);
    if (!business) throw new NotFoundError('Esa tienda no existe');
    if (!step.from.includes(business.status)) throw new ConflictError('Esa acción no se puede hacer con la tienda en su estado actual');
    const note = (input.note ?? '').trim().slice(0, 300);
    if (step.needsNote && !note) throw new ValidationError('Escribe el motivo: lo verá el dueño de la tienda');
    const saved = await this.businesses.setReview(id, { status: step.to, reviewNote: step.needsNote ? note : '', reviewedById: adminId });
    return (await this.admin.toAdmin([saved]))[0];
  }
}

/** Para el gateway: con qué API atender la tienda (la de Parla misma si es «native», o la suya). */
export interface InternalIntegration {
  service: string;
  name: string;
  format: string;
  enabled: boolean;
  baseUrl: string;
  prefix: string;
  apiKey: string;
  adminKey: string;
  /** Desde cuándo un pedido es «grande» para esta tienda (el gateway se lo avisa a la ferretería al crear la venta). */
  bigOrder: { totalCents: number; units: number };
}

@Injectable()
export class GetInternalIntegrationUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async execute(storeKey: string): Promise<InternalIntegration> {
    const b = await this.businesses.findById(storeKey);
    const off: InternalIntegration = { service: storeKey, name: b?.name ?? '', format: 'parla', enabled: false, baseUrl: '', prefix: '', apiKey: '', adminKey: '', bigOrder: { totalCents: 0, units: 0 } };
    if (!b || b.status !== 'approved') return off;
    if (b.source === 'native') {
      // El catálogo de Parla se sirve desde el core con la misma API de tienda (ver InternalStoreApiController).
      return { ...off, enabled: true, baseUrl: this.env.coreInternalUrl, prefix: `/api/internal/store-api/${b.id}`, apiKey: this.env.internalToken, adminKey: this.env.internalToken };
    }
    const { totalCents, units } = bigOrderRulesOf(b);
    return { ...off, bigOrder: { totalCents, units }, enabled: !!b.api.baseUrl, format: b.api.format, baseUrl: b.api.baseUrl, prefix: b.api.prefix, apiKey: b.api.apiKey, adminKey: b.api.adminKey };
  }
}
