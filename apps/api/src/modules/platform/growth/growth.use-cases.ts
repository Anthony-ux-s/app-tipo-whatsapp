import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminRoulette,
  CampaignKind,
  MyCoupon,
  MyInterests,
  PublicRoulette,
  RouletteCampaignInput,
  RouletteSpinResult,
  SegmentInfo,
  TrendsReport,
} from '@parla/types';
import { randomBytes } from 'node:crypto';
import { belongsTo, describeSegments, segmentOf } from '../../../kernel/customer-segments';
import { ConflictError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { assertRoulette, describePrize, expectedCostPercent, pickPrize, spinSlot } from '../../../kernel/roulette';
import { AUTH_REPOSITORY, type AuthRepository } from '../identity/auth/auth.repository';
import { requireAdmin } from '../services/use-cases/claims.use-cases';
import { GROWTH_REPOSITORY, type CampaignRecord, type GrowthRepository } from './growth.repository';

const DAY_MS = 86_400_000;
const TREND_LIMIT = 10;
const MAX_TERM = 40;

function toPublic(c: CampaignRecord): PublicRoulette {
  return { id: c.id, kind: c.kind, endsAt: c.endsAt?.toISOString() ?? null, title: c.title, subtitle: c.subtitle, testMode: c.testMode, prizes: c.prizes.map((p) => ({ id: p.id, label: p.label, kind: p.kind })) };
}

function clean(input: RouletteCampaignInput): RouletteCampaignInput {
  const dates = { startsAt: input.startsAt || null, endsAt: input.endsAt || null };
  const value = {
    ...input,
    ...dates,
    name: input.name.trim(),
    title: input.title.trim(),
    subtitle: input.subtitle.trim(),
    prizes: input.prizes.map((p) => ({
      ...p,
      label: p.label.trim(),
      // Un premio «sin premio» no lleva descuento ni vigencia.
      ...(p.kind === 'none' ? { value: 0, maxDiscountCents: null, minSubtotalCents: 0, validDays: 1 } : p.kind === 'free_delivery' ? { value: 0, maxDiscountCents: null } : p.kind === 'amount' ? { maxDiscountCents: null } : {}),
    })),
  };
  assertRoulette(value);
  return value;
}

/** Las campañas que le tocan a esta persona ahora (y todavía no jugó en este período), la más nueva primero. */
async function eligibleCampaigns(repo: GrowthRepository, userId: string, now: Date): Promise<CampaignRecord[]> {
  const stats = await repo.customerStats(userId);
  if (!stats) return [];
  const found: CampaignRecord[] = [];
  const enabled = (await repo.listCampaigns()).filter((c) => c.enabled);
  const ownSegments = new Set(enabled.filter((c) => c.segment !== 'all').map((c) => c.segment));
  const mine = segmentOf(stats, now);
  for (const c of enabled) {
    // Fuera de su ventana de fechas (aún no empieza o ya terminó) no se muestra.
    if ((c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt <= now)) continue;
    if (!belongsTo(c.segment, mine, (s) => ownSegments.has(s))) continue;
    // En modo de prueba siempre le toca, aunque ya haya girado.
    if (c.testMode || !(await repo.hasSpun(userId, c.id, spinSlot(now, c.cooldownDays)))) found.push(c);
  }
  return found;
}

/** Al abrir la app: ¿hay una ruleta para esta persona? Nunca devuelve los pesos de los premios. */
@Injectable()
export class GetMyRouletteUseCase {
  constructor(@Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository) {}

  async execute(userId: string, now = new Date()): Promise<PublicRoulette | null> {
    const eligible = await eligibleCampaigns(this.repo, userId, now);
    // Las de prueba van rotando para poder ver todas las estrategias; las reales, una a la vez, la más nueva primero.
    const tests = eligible.filter((c) => c.testMode);
    const campaign = tests.length ? tests[Math.floor(Math.random() * tests.length)] : eligible[0];
    return campaign ? toPublic(campaign) : null;
  }
}

/** El giro: el premio lo decide el servidor (con azar criptográfico), nunca la app. */
@Injectable()
export class SpinRouletteUseCase {
  constructor(@Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository) {}

  async execute(userId: string, campaignId: string, now = new Date()): Promise<RouletteSpinResult> {
    const campaign = (await eligibleCampaigns(this.repo, userId, now)).find((c) => c.id === campaignId);
    if (!campaign) throw new ConflictError('Esta ruleta ya no está disponible para ti');
    const { prize, index } = pickPrize(campaign.prizes);
    const endsAt = new Date(now.getTime() + prize.validDays * DAY_MS);
    const coupon =
      prize.kind === 'none'
        ? null
        : {
            code: `RUL${randomBytes(4).toString('hex').toUpperCase()}`,
            description: describePrize(prize),
            kind: prize.kind,
            value: prize.value,
            maxDiscountCents: prize.kind === 'percent' ? prize.maxDiscountCents : null,
            minSubtotalCents: prize.minSubtotalCents,
            endsAt,
          };
    const saved = await this.repo.recordSpin({ campaignId, userId, slot: campaign.testMode ? -Math.floor(now.getTime() / 1000) : spinSlot(now, campaign.cooldownDays), prize, coupon });
    if (!saved) throw new ConflictError('Ya giraste la ruleta');
    return {
      prizeId: prize.id,
      prizeIndex: index,
      label: prize.label,
      coupon: coupon ? { code: coupon.code, description: coupon.description, endsAt: endsAt.toISOString(), kind: coupon.kind } : null,
    };
  }
}

/** «Mis cupones»: los que ganó y puede usar (aparecen en el carrito). */
@Injectable()
export class ListMyCouponsUseCase {
  constructor(@Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository) {}

  execute(userId: string, now = new Date()): Promise<MyCoupon[]> {
    return this.repo.myCoupons(userId, now);
  }
}

/** Lo que la persona busca en las tiendas: sirve para sus ofertas y para las tendencias de soporte. */
@Injectable()
export class RecordSearchUseCase {
  constructor(@Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository) {}

  async execute(userId: string, service: string, rawTerm: string): Promise<void> {
    const term = rawTerm.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_TERM);
    if (term.length < 2) return;
    await this.repo.logSearch(userId, service, term);
  }
}

@Injectable()
export class GetMyInterestsUseCase {
  constructor(@Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository) {}

  execute(userId: string, now = new Date()): Promise<MyInterests> {
    return this.repo.interests(userId, now);
  }
}

/** Soporte: las ruletas con sus números y a cuánta gente le llega cada una. */
@Injectable()
export class ListRoulettesUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository,
  ) {}

  async execute(adminId: string, now = new Date()): Promise<{ roulettes: AdminRoulette[]; segments: SegmentInfo[] }> {
    await requireAdmin(this.users, adminId);
    const [campaigns, counts] = await Promise.all([this.repo.listCampaigns(), this.repo.segmentCounts(now)]);
    const roulettes = await Promise.all(campaigns.map(async (c) => this.toAdmin(c, counts[c.segment])));
    return { roulettes, segments: describeSegments(counts) };
  }

  private async toAdmin(c: CampaignRecord, audience: number): Promise<AdminRoulette> {
    const numbers = await this.repo.campaignNumbers(c.id);
    return {
      id: c.id,
      kind: c.kind,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      name: c.name,
      title: c.title,
      subtitle: c.subtitle,
      segment: c.segment,
      cooldownDays: c.cooldownDays,
      testMode: c.testMode,
      prizes: c.prizes,
      enabled: c.enabled,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      audience,
      expectedCostPercent: expectedCostPercent(c.prizes),
      ...numbers,
    };
  }
}

@Injectable()
export class SaveRouletteUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository,
  ) {}

  /** Sin `id` crea una ruleta (apagada, para revisarla antes de encenderla); con `id` la edita. */
  async execute(adminId: string, input: RouletteCampaignInput, id?: string): Promise<{ id: string }> {
    await requireAdmin(this.users, adminId);
    const { startsAt, endsAt, ...rest } = clean(input);
    const value = { ...rest, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null };
    if (!id) return { id: (await this.repo.createCampaign(value, adminId)).id };
    const updated = await this.repo.updateCampaign(id, value);
    if (!updated) throw new NotFoundError('Esa ruleta no existe');
    return { id };
  }
}

@Injectable()
export class SetRouletteEnabledUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository,
  ) {}

  async execute(adminId: string, id: string, enabled: boolean): Promise<void> {
    await requireAdmin(this.users, adminId);
    if (!(await this.repo.setEnabled(id, enabled))) throw new NotFoundError('Esa ruleta no existe');
  }
}

@Injectable()
export class GetTrendsUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(GROWTH_REPOSITORY) private readonly repo: GrowthRepository,
  ) {}

  async execute(adminId: string, days: number, now = new Date()): Promise<TrendsReport> {
    await requireAdmin(this.users, adminId);
    if (![7, 30, 90].includes(days)) throw new ValidationError('Elige 7, 30 o 90 días');
    return { days, ...(await this.repo.trends(new Date(now.getTime() - days * DAY_MS), TREND_LIMIT)) };
  }
}
