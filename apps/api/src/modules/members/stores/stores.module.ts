import { Module } from '@nestjs/common';
import { StoresEngineModule } from '../../platform/stores/stores-engine.module';
import { AdminStoresController } from './admin-stores.controller';
import { BusinessFerrohubController, FerrohubController, FerrohubWebhookController } from './ferrohub.controller';
import { BusinessCatalogController, StoresController } from './stores.controller';

@Module({
  imports: [StoresEngineModule],
  controllers: [StoresController, FerrohubController, FerrohubWebhookController, BusinessCatalogController, BusinessFerrohubController, AdminStoresController],
})
export class StoresModule {}
