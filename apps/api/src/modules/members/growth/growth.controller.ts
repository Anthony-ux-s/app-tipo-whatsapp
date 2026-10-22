import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { MyCoupon, MyInterests, PublicRoulette, RouletteSpinResult } from '@parla/types';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetMyInterestsUseCase, GetMyRouletteUseCase, ListMyCouponsUseCase, RecordSearchUseCase, SpinRouletteUseCase } from '../../platform/growth/growth.use-cases';

class SearchDto {
  @IsString() @MaxLength(60) service: string;
  @IsString() @MaxLength(60) term: string;
}

/** Lo que ve el cliente: la ruleta que le toca, sus cupones y lo que le interesa. */
@Controller()
export class GrowthController {
  constructor(
    private readonly myRoulette: GetMyRouletteUseCase,
    private readonly spinRoulette: SpinRouletteUseCase,
    private readonly myCoupons: ListMyCouponsUseCase,
    private readonly recordSearch: RecordSearchUseCase,
    private readonly myInterests: GetMyInterestsUseCase,
  ) {}

  /** La ruleta de hoy, o null si no hay (o ya giró). */
  @Get('roulette')
  async roulette(@CurrentUser() user: AuthUser): Promise<{ roulette: PublicRoulette | null }> {
    return { roulette: await this.myRoulette.execute(user.userId) };
  }

  @Post('roulette/:id/spin')
  spin(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<RouletteSpinResult> {
    return this.spinRoulette.execute(user.userId, id);
  }

  @Get('coupons/mine')
  coupons(@CurrentUser() user: AuthUser): Promise<MyCoupon[]> {
    return this.myCoupons.execute(user.userId);
  }

  @HttpCode(204)
  @Post('interests/search')
  async search(@CurrentUser() user: AuthUser, @Body() body: SearchDto): Promise<void> {
    await this.recordSearch.execute(user.userId, body.service, body.term);
  }

  @Get('interests')
  interests(@CurrentUser() user: AuthUser): Promise<MyInterests> {
    return this.myInterests.execute(user.userId);
  }
}
