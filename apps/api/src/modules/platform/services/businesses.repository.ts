import type { BusinessInfo, CatalogSource, GeoPoint, ServiceId, StoreIntegrationFormat, StoreStatus, UpdateBusinessRequest } from '@parla/types';

/** La API propia de una tienda (source = api), con las claves: solo la leen el core y el gateway. */
export interface StoreApiConfig {
  format: StoreIntegrationFormat;
  baseUrl: string;
  prefix: string;
  apiKey: string;
  adminKey: string;
}

/** Conexión con FerroHub: de qué ferretería es, cómo se conectó y el secreto con que firma sus avisos. */
export interface ConnectorLink {
  kind: 'ferrohub';
  origin: 'code' | 'provision';
  tenantId: string;
  webhookSecret: string;
  connectedAt: Date;
  verifiedAt: Date | null;
}

/** Tienda tal como la ven los casos de uso: una categoría, un dueño y un estado de revisión. */
export interface BusinessRecord extends Omit<BusinessInfo, 'connector' | 'verified'> {
  ownerId: string;
  createdAt: Date;
  api: StoreApiConfig;
  connector: ConnectorLink | null;
  /** Umbrales de pedido grande (null = los generales) y el WhatsApp de su administrador. */
  bigOrderCents: number | null;
  bigOrderUnits: number | null;
  adminWhatsapp: string;
  /** Número de PagaYa donde se le depositan sus ventas ('' = todavía no lo puso). */
  payoutPhone: string;
}

export const NO_API: StoreApiConfig = { format: 'parla', baseUrl: '', prefix: '', apiKey: '', adminKey: '' };

export interface NewBusiness {
  name: string;
  service: ServiceId;
  description: string;
  ownerId: string;
  address: string;
  location: GeoPoint | null;
  opensAt: string;
  closesAt: string;
}

export interface StoreFilter {
  service?: ServiceId;
  status?: StoreStatus;
}

export interface BusinessesRepository {
  findById(id: string): Promise<BusinessRecord | null>;
  findByOwner(ownerId: string): Promise<BusinessRecord | null>;
  /** Una tienda nueva queda en revisión (pending). */
  create(input: NewBusiness): Promise<BusinessRecord>;
  /** El dueño cambia sus datos, pausa los pedidos o cambia el horario. */
  update(id: string, changes: UpdateBusinessRequest): Promise<BusinessRecord>;
  /** Soporte aprueba, rechaza, suspende o reactiva. */
  setReview(id: string, review: { status: StoreStatus; reviewNote: string; reviewedById: string }): Promise<BusinessRecord>;
  /** De dónde sale el catálogo: el de Parla (native) o su API (api, con sus datos). */
  setSource(id: string, source: CatalogSource, api: StoreApiConfig): Promise<BusinessRecord>;
  /** Guarda (o quita, con null) la conexión con FerroHub. */
  setConnector(id: string, link: ConnectorLink | null): Promise<BusinessRecord>;
  /** Desde cuándo un pedido es grande en esta tienda y a qué WhatsApp escribirle. */
  setBigOrderRules(id: string, rules: { totalCents: number | null; units: number | null; whatsapp: string }): Promise<BusinessRecord>;
  setPayoutPhone(id: string, phone: string): Promise<void>;
  /** Borra una tienda recién creada cuyo alta no terminó. */
  remove(id: string): Promise<void>;
  list(filter: StoreFilter): Promise<BusinessRecord[]>;
  /** Cuántas tiendas aprobadas hay por categoría. */
  countApprovedByService(): Promise<Record<string, number>>;
}

export const BUSINESSES_REPOSITORY = Symbol('BUSINESSES_REPOSITORY');
