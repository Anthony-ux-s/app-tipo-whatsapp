import type { GeoPoint, ServiceId } from './services.types';

/**
 * Tiendas de Parla (marketplace): cada tienda la registra su dueño desde la app y soporte la aprueba.
 * Una tienda vende desde el catálogo de Parla («native») o desde su propia API («api»).
 * En el gateway y en las rutas /api/services/:storeId/... la «clave de tienda» es el id de la tienda.
 */
export type StoreStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type CatalogSource = 'native' | 'api';

/** La tienda tal como la ve un cliente en la lista de su categoría. */
export interface StoreSummary {
  id: string;
  name: string;
  /** Categoría: mercado, tecnologia, ferreteria o salud. */
  service: ServiceId;
  description: string;
  address: string;
  location: GeoPoint | null;
  /** ¿Recibe pedidos ahora? (aprobada, sin pausa y en horario). */
  open: boolean;
  closedMessage: string | null;
  opensAt: string;
  closesAt: string;
  /** Calificación promedio de sus pedidos (null si todavía no tiene). */
  ratingAvg: number | null;
  ratingCount: number;
}

export interface StoreCategoryInfo {
  service: ServiceId;
  /** Tiendas aprobadas en la categoría. */
  stores: number;
}

export interface RegisterStoreRequest {
  name: string;
  service: ServiceId;
  description?: string;
  address: string;
  location?: GeoPoint | null;
  opensAt?: string;
  closesAt?: string;
}

/** Un producto del catálogo propio de la tienda. Precios en céntimos. */
export interface StoreProduct {
  sku: string;
  name: string;
  /** Presentación: «1 kg», «750 ml»… */
  unit: string;
  priceCents: number;
  /** Precio normal cuando el producto está en oferta (priceCents es el rebajado). */
  listPriceCents: number | null;
  stock: number;
  category: string;
  /** Solo https://. */
  imageUrl: string | null;
  /** Los inactivos no se muestran a los clientes. */
  active: boolean;
}

export interface ImportProductsRequest {
  /** Las filas ya leídas del archivo (CSV/Excel) en el navegador. Se crean o actualizan por sku. */
  rows: StoreProduct[];
}

export interface ImportProductsResult {
  created: number;
  updated: number;
  /** Filas que no se pudieron guardar, con el número de fila (1 = primera fila de datos) y el motivo. */
  errors: { row: number; sku: string; message: string }[];
}

export type StoreIntegrationFormat = 'parla' | 'redwiiil';

/** Conexión de una tienda que ya tiene su propio sistema (la API que Parla consulta). */
export interface StoreIntegrationInput {
  format?: StoreIntegrationFormat;
  baseUrl: string;
  prefix: string;
  /** Llave que Parla usa ante la tienda. Vacío = no cambiar la guardada. */
  apiKey?: string;
  /** Llave de administración del catálogo (opcional). Vacío = no cambiar. */
  adminKey?: string;
  clearApiKey?: boolean;
  clearAdminKey?: boolean;
}

export interface StoreIntegrationInfo {
  source: CatalogSource;
  format: StoreIntegrationFormat;
  baseUrl: string;
  prefix: string;
  apiKeySet: boolean;
  apiKeyHint: string | null;
  adminKeySet: boolean;
}

/** Soporte: una tienda con su dueño y su estado. */
export interface AdminStore {
  id: string;
  name: string;
  service: ServiceId;
  description: string;
  status: StoreStatus;
  reviewNote: string;
  source: CatalogSource;
  address: string;
  location: GeoPoint | null;
  ownerId: string;
  ownerName: string;
  ownerPhone: string | null;
  createdAt: string;
  /** Productos del catálogo propio (0 en las tiendas con API). */
  productCount: number;
  /** Datos de la API conectada (si la tienda usa una). */
  integration: StoreIntegrationInfo;
}

export interface ReviewStoreRequest {
  action: 'approve' | 'reject' | 'suspend' | 'reactivate';
  /** Motivo (obligatorio al rechazar o suspender; lo ve el dueño). */
  note?: string;
}
