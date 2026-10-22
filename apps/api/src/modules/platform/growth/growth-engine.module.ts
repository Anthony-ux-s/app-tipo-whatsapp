import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { GROWTH_REPOSITORY } from './growth.repository';
import {
  GetMyInterestsUseCase,
  GetMyRouletteUseCase,
  GetTrendsUseCase,
  ListMyCouponsUseCase,
  ListRoulettesUseCase,
  RecordSearchUseCase,
  SaveRouletteUseCase,
  SetRouletteEnabledUseCase,
  SpinRouletteUseCase,
} from './growth.use-cases';
import { PrismaGrowthRepository } from './prisma-growth.repository';

const USE_CASES = [
  GetMyRouletteUseCase,
  SpinRouletteUseCase,
  ListMyCouponsUseCase,
  RecordSearchUseCase,
  GetMyInterestsUseCase,
  ListRoulettesUseCase,
  SaveRouletteUseCase,
  SetRouletteEnabledUseCase,
  GetTrendsUseCase,
];

/** Crecimiento: ruletas de descuentos por tipo de cliente y ofertas según lo que cada quien busca y compra. */
@Module({
  imports: [AuthModule],
  providers: [{ provide: GROWTH_REPOSITORY, useClass: PrismaGrowthRepository }, ...USE_CASES],
  exports: USE_CASES,
})
export class GrowthEngineModule {}
