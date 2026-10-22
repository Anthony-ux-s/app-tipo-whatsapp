import { Module } from '@nestjs/common';
import { GrowthEngineModule } from '../../platform/growth/growth-engine.module';
import { AdminGrowthController } from './admin-growth.controller';
import { GrowthController } from './growth.controller';

@Module({
  imports: [GrowthEngineModule],
  controllers: [GrowthController, AdminGrowthController],
})
export class GrowthModule {}
