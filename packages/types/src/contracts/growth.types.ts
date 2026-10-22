import type { CouponKind } from './services.types';

/**
 * A quién le sale una ruleta. Cada cliente cae en un solo grupo (el más específico que cumple), así
 * que dos ruletas de grupos distintos nunca compiten por la misma persona.
 */
export type CustomerSegment = 'vip' | 'loyal' | 'lapsed' | 'never_bought' | 'new' | 'all';

/** Un grupo de clientes, con cuántas personas hay hoy (para que soporte vea a quién llega). */
export interface SegmentInfo {
  id: CustomerSegment;
  label: string;
  /** La regla en palabras, tal como la aplica el sistema. */
  rule: string;
  audience: number;
}

/**
 * Estrategias de campaña: ruleta, «rasca y gana» y «cofre sorpresa» (juegos con premio al azar) y
 * «oferta relámpago» (un cupón con cuenta regresiva).
 */
export type CampaignKind = 'roulette' | 'scratch' | 'box' | 'flash';

/** Qué se gana en un giro: nada, o un cupón personal que solo vale para quien lo ganó. */
export type PrizeKind = 'none' | CouponKind;

export interface RoulettePrize {
  id: string;
  /** Lo que se lee en la rueda («10 % OFF», «Envío gratis», «Sigue intentando»). */
  label: string;
  kind: PrizeKind;
  /** Porcentaje (1 a 100) o céntimos de descuento; 0 en envío gratis o sin premio. */
  value: number;
  maxDiscountCents: number | null;
  minSubtotalCents: number;
  /** Días que el cupón sirve desde que se gana. */
  validDays: number;
  /** Peso relativo: la probabilidad es su peso entre la suma de todos. */
  weight: number;
}

export interface RouletteCampaignInput {
  kind: CampaignKind;
  name: string;
  /** Titular que ve el cliente («¡Gira y gana!»). */
  title: string;
  subtitle: string;
  segment: CustomerSegment;
  /** Cada cuántos días puede volver a girar una persona. */
  cooldownDays: number;
  /** Desde y hasta cuándo está activa (ISO). La oferta relámpago necesita el «hasta». */
  startsAt: string | null;
  endsAt: string | null;
  /** Para probar: aparece en cada visita y los giros no gastan el turno. Apágalo al lanzarla. */
  testMode: boolean;
  prizes: RoulettePrize[];
}

/** Ruleta para soporte, con sus números. */
export interface AdminRoulette extends RouletteCampaignInput {
  id: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  audience: number;
  spins: number;
  winners: number;
  /** Cupones ganados que ya se usaron en un pedido. */
  redeemed: number;
  /** Cuánto se descontó en total con esos cupones. */
  discountCents: number;
  /** Cuánto cuesta en promedio cada giro, en % de una compra de referencia (S/ 50). */
  expectedCostPercent: number;
}

/** Lo que ve el cliente: la rueda sin los pesos. */
export interface PublicRoulette {
  id: string;
  kind: CampaignKind;
  /** Cuándo termina (para la cuenta regresiva de la oferta relámpago). */
  endsAt: string | null;
  title: string;
  subtitle: string;
  testMode: boolean;
  prizes: Pick<RoulettePrize, 'id' | 'label' | 'kind'>[];
}

export interface RouletteSpinResult {
  prizeId: string;
  prizeIndex: number;
  label: string;
  coupon: { code: string; description: string; endsAt: string; kind: CouponKind } | null;
}

/** Un cupón personal que el cliente ganó y todavía puede usar. */
export interface MyCoupon {
  code: string;
  description: string;
  kind: CouponKind;
  minSubtotalCents: number;
  endsAt: string | null;
}

/** Lo que busca y compra una persona, para ordenar las ofertas que le salen primero. */
export interface MyInterests {
  /** Productos que compró (cantidad, con más peso lo más reciente). */
  purchases: { productId: string; quantity: number; lastAt: string }[];
  /** Lo que buscó, lo más buscado primero. */
  searches: { term: string; count: number }[];
}

export interface TrendsReport {
  days: number;
  searches: { term: string; count: number; people: number }[];
  products: { productId: string; name: string; quantity: number; people: number }[];
}
