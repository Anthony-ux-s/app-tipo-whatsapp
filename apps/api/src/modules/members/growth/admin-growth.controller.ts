import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { AdminRoulette, CampaignKind, CustomerSegment, PrizeKind, RouletteCampaignInput, RoulettePrize, SegmentInfo, TrendsReport } from '@parla/types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetTrendsUseCase, ListRoulettesUseCase, SaveRouletteUseCase, SetRouletteEnabledUseCase } from '../../platform/growth/growth.use-cases';

const KINDS: CampaignKind[] = ['roulette', 'scratch', 'box', 'flash'];
const SEGMENTS: CustomerSegment[] = ['vip', 'loyal', 'lapsed', 'never_bought', 'new', 'all'];
const PRIZE_KINDS: PrizeKind[] = ['none', 'percent', 'amount', 'free_delivery'];

class PrizeDto implements RoulettePrize {
  @IsString() @MaxLength(40) id: string;
  @IsString() @MaxLength(40) label: string;
  @IsIn(PRIZE_KINDS) kind: PrizeKind;
  @IsInt() value: number;
  @IsOptional() @IsInt() maxDiscountCents: number | null;
  @IsInt() minSubtotalCents: number;
  @IsInt() validDays: number;
  @IsInt() weight: number;
}

class RouletteDto implements RouletteCampaignInput {
  @IsIn(KINDS) kind: CampaignKind;
  @IsOptional() @IsISO8601() startsAt: string | null;
  @IsOptional() @IsISO8601() endsAt: string | null;
  @IsString() @MaxLength(80) name: string;
  @IsString() @MaxLength(80) title: string;
  @IsString() @MaxLength(200) subtitle: string;
  @IsIn(SEGMENTS) segment: CustomerSegment;
  @IsInt() cooldownDays: number;
  @IsBoolean() testMode: boolean;
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PrizeDto) prizes: PrizeDto[];
}

class EnabledDto {
  @IsBoolean() enabled: boolean;
}

/** Soporte: ruletas de descuentos por tipo de cliente y tendencias de búsqueda y compra. */
@Controller('admin')
export class AdminGrowthController {
  constructor(
    private readonly list: ListRoulettesUseCase,
    private readonly save: SaveRouletteUseCase,
    private readonly setEnabled: SetRouletteEnabledUseCase,
    private readonly trendsReport: GetTrendsUseCase,
  ) {}

  @Get('roulettes')
  roulettes(@CurrentUser() user: AuthUser): Promise<{ roulettes: AdminRoulette[]; segments: SegmentInfo[] }> {
    return this.list.execute(user.userId);
  }

  @Post('roulettes')
  create(@CurrentUser() user: AuthUser, @Body() body: RouletteDto): Promise<{ id: string }> {
    return this.save.execute(user.userId, body);
  }

  @Put('roulettes/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RouletteDto): Promise<{ id: string }> {
    return this.save.execute(user.userId, body, id);
  }

  @HttpCode(204)
  @Post('roulettes/:id/enabled')
  async enabled(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: EnabledDto): Promise<void> {
    await this.setEnabled.execute(user.userId, id, body.enabled);
  }

  /** Lo más buscado y lo más comprado en los últimos 7, 30 o 90 días. */
  @Get('trends')
  trends(@CurrentUser() user: AuthUser, @Query('days') days?: string): Promise<TrendsReport> {
    return this.trendsReport.execute(user.userId, [7, 30, 90].includes(Number(days)) ? Number(days) : 30);
  }
}
