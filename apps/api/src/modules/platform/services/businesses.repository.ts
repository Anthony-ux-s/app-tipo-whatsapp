import type { BusinessInfo, CatalogSource, GeoPoint, ServiceId, StoreIntegrationFormat, StoreStatus, UpdateBusinessRequest } from '@parla/types';

/** La API propia de una tienda (source = api), con las claves: solo la leen el core y el gateway. */
export interface StoreApiConfig {
  format: StoreIntegrationFormat;
  baseUrl: string;
  prefix: string;
  apiKey: string;
  adminKey: string;
}

/** Tienda tal como la ven los casos de uso: una categoría, un dueño y un estado de revisión. */
export interface BusinessRecord extends BusinessInfo {
  ownerId: string;
  createdAt: Date;
  api: StoreApiConfig;
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
  list(filter: StoreFilter): Promise<BusinessRecord[]>;
  /** Cuántas tiendas aprobadas hay por categoría. */
  countApprovedByService(): Promise<Record<string, number>>;
}

export const BUSINESSES_REPOSITORY = Symbol('BUSINESSES_REPOSITORY');
