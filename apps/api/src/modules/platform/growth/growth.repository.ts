import type { CampaignKind, CouponKind, CustomerSegment, MyCoupon, MyInterests, RoulettePrize, TrendsReport } from '@parla/types';
import type { CustomerStats } from '../../../kernel/customer-segments';

export interface CampaignRecord {
  id: string;
  kind: CampaignKind;
  startsAt: Date | null;
  endsAt: Date | null;
  name: string;
  title: string;
  subtitle: string;
  segment: CustomerSegment;
  cooldownDays: number;
  testMode: boolean;
  prizes: RoulettePrize[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NewCampaign = Omit<CampaignRecord, 'id' | 'enabled' | 'createdAt' | 'updatedAt'>;

export interface CampaignNumbers {
  spins: number;
  winners: number;
  redeemed: number;
  discountCents: number;
}

export interface NewSpin {
  campaignId: string;
  userId: string;
  slot: number;
  prize: Pick<RoulettePrize, 'id' | 'label'>;
  /** El cupón personal que se crea junto con el giro (null si no ganó nada). */
  coupon: {
    code: string;
    description: string;
    kind: CouponKind;
    value: number;
    maxDiscountCents: number | null;
    minSubtotalCents: number;
    endsAt: Date;
  } | null;
}

/** Ruletas, giros, cupones personales y lo que busca y compra la gente. */
export interface GrowthRepository {
  listCampaigns(): Promise<CampaignRecord[]>;
  findCampaign(id: string): Promise<CampaignRecord | null>;
  createCampaign(input: NewCampaign, adminId: string): Promise<CampaignRecord>;
  updateCampaign(id: string, input: NewCampaign): Promise<CampaignRecord | null>;
  setEnabled(id: string, enabled: boolean): Promise<CampaignRecord | null>;
  campaignNumbers(id: string): Promise<CampaignNumbers>;

  /** Pedidos y fecha de alta de una persona (null si la cuenta no existe o está bloqueada). */
  customerStats(userId: string): Promise<CustomerStats | null>;
  /** Cuántas personas hay en cada grupo (clientes: no administradores ni bloqueados). */
  segmentCounts(now: Date): Promise<Record<CustomerSegment, number>>;

  /** ¿Ya giró esta persona en este período de espera? */
  hasSpun(userId: string, campaignId: string, slot: number): Promise<boolean>;
  /** Guarda el giro y su cupón a la vez; false si otro giro del mismo período se adelantó. */
  recordSpin(spin: NewSpin): Promise<boolean>;

  myCoupons(userId: string, now: Date): Promise<MyCoupon[]>;

  logSearch(userId: string, service: string, term: string): Promise<void>;
  interests(userId: string, now: Date): Promise<MyInterests>;
  trends(since: Date, limit: number): Promise<Omit<TrendsReport, 'days'>>;
}

export const GROWTH_REPOSITORY = Symbol('GROWTH_REPOSITORY');
