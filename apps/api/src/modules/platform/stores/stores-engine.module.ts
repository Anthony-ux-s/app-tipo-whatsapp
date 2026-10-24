import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { OrdersEngineModule } from '../services/orders-engine.module';
import { FERROHUB_CLIENT, HttpFerrohubClient } from './ferrohub.client';
import { ConnectFerrohubUseCase, DisconnectFerrohubUseCase, FerrohubSsoUseCase, FerrohubWebhookUseCase, ProvisionFerrohubUseCase, SyncFerrohubStoreUseCase } from './ferrohub.use-cases';
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
  ConnectFerrohubUseCase,
  ProvisionFerrohubUseCase,
  FerrohubSsoUseCase,
  SyncFerrohubStoreUseCase,
  DisconnectFerrohubUseCase,
  FerrohubWebhookUseCase,
];

/** Marketplace: tiendas que se registran, su catálogo propio, su conexión por API y la revisión de soporte. */
@Module({
  imports: [AuthModule, OrdersEngineModule],
  providers: [{ provide: PRODUCTS_REPOSITORY, useClass: PrismaProductsRepository }, { provide: FERROHUB_CLIENT, useClass: HttpFerrohubClient }, ...USE_CASES],
  exports: USE_CASES,
})
export class StoresEngineModule {}
