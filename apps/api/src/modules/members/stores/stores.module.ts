import { Module } from '@nestjs/common';
import { StoresEngineModule } from '../../platform/stores/stores-engine.module';
import { AdminStoresController } from './admin-stores.controller';
import { BusinessCatalogController, StoresController } from './stores.controller';

@Module({
  imports: [StoresEngineModule],
  controllers: [StoresController, BusinessCatalogController, AdminStoresController],
})
export class StoresModule {}
