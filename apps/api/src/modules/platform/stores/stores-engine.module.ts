import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { OrdersEngineModule } from '../services/orders-engine.module';
import { PRODUCTS_REPOSITORY } from './products.repository';
import { PrismaProductsRepository } from './prisma-products.repository';
import { StoreApiUseCase } from './store-api.use-cases';
import {
  GetInternalIntegrationUseCase,
  GetStoreUseCase,
  ListAdminStoresUseCase,
  ListStoreCategoriesUseCase,
  ListStoresUseCase,
  ManageIntegrationUseCase,
  ManageProductsUseCase,
  RegisterStoreUseCase,
  ReviewStoreUseCase,
} from './stores.use-cases';

const USE_CASES = [
  RegisterStoreUseCase,
  ListStoresUseCase,
  GetStoreUseCase,
  ListStoreCategoriesUseCase,
  ManageProductsUseCase,
  ManageIntegrationUseCase,
  ListAdminStoresUseCase,
  ReviewStoreUseCase,
  GetInternalIntegrationUseCase,
  StoreApiUseCase,
];

/** Marketplace: tiendas que se registran, su catálogo propio, su conexión por API y la revisión de soporte. */
@Module({
  imports: [AuthModule, OrdersEngineModule],
  providers: [{ provide: PRODUCTS_REPOSITORY, useClass: PrismaProductsRepository }, ...USE_CASES],
  exports: USE_CASES,
})
export class StoresEngineModule {}
