import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { BusinessInfo, ImportProductsResult, IntegrationTestResult, ServiceId, StoreCategoryInfo, StoreIntegrationFormat, StoreIntegrationInfo, StoreProduct, StoreSummary } from '@parla/types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetStoreUseCase, ListStoreCategoriesUseCase, ListStoresUseCase, ManageIntegrationUseCase, ManageProductsUseCase, RegisterStoreUseCase } from '../../platform/stores/stores.use-cases';

const SERVICES: ServiceId[] = ['mercado', 'tecnologia', 'ferreteria', 'salud'];

class PointDto {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

class RegisterStoreDto {
  @IsString() @MaxLength(80) name: string;
  @IsIn(SERVICES) service: ServiceId;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsString() @MaxLength(250) address: string;
  @IsString() @MaxLength(30) phone: string;
  @IsOptional() @ValidateNested() @Type(() => PointDto) location?: PointDto | null;
  @IsOptional() @IsString() opensAt?: string;
  @IsOptional() @IsString() closesAt?: string;
}

export class ProductDto implements StoreProduct {
  @IsString() @MaxLength(80) sku: string;
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(80) unit: string;
  @IsInt() priceCents: number;
  @IsOptional() @IsInt() listPriceCents: number | null;
  @IsInt() @Min(0) stock: number;
  @IsOptional() @IsString() @MaxLength(80) category: string;
  @IsOptional() @IsString() @MaxLength(600) imageUrl: string | null;
  @IsOptional() @IsBoolean() active: boolean;
}

class ImportDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ProductDto) rows: ProductDto[];
}

class IntegrationDto {
  @IsOptional() @IsIn(['parla', 'redwiiil']) format?: StoreIntegrationFormat;
  @IsString() @MaxLength(300) baseUrl: string;
  @IsString() @MaxLength(100) prefix: string;
  @IsOptional() @IsString() @MaxLength(300) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(300) adminKey?: string;
  @IsOptional() @IsBoolean() clearApiKey?: boolean;
  @IsOptional() @IsBoolean() clearAdminKey?: boolean;
}

/** Lo que ven los clientes: las tiendas aprobadas de cada categoría. Abrir una tienda la puede pedir cualquiera. */
@Controller('stores')
export class StoresController {
  constructor(
    private readonly list: ListStoresUseCase,
    private readonly getStore: GetStoreUseCase,
    private readonly categories: ListStoreCategoriesUseCase,
    private readonly register: RegisterStoreUseCase,
  ) {}

  @Get()
  stores(@Query('service') service?: string): Promise<StoreSummary[]> {
    return this.list.execute(service as ServiceId | undefined);
  }

  @Get('categories')
  categoriesList(): Promise<StoreCategoryInfo[]> {
    return this.categories.execute();
  }

  @Get(':id')
  one(@Param('id') id: string): Promise<StoreSummary> {
    return this.getStore.execute(id);
  }

  /** «Abrir mi tienda»: queda en revisión hasta que soporte la apruebe. */
  @Post()
  open(@CurrentUser() user: AuthUser, @Body() body: RegisterStoreDto): Promise<BusinessInfo> {
    return this.register.execute(user.userId, { ...body, location: body.location ?? null });
  }
}

/** Catálogo propio de la tienda y conexión con su propia API (solo el dueño). */
@Controller('business')
export class BusinessCatalogController {
  constructor(
    private readonly products: ManageProductsUseCase,
    private readonly integration: ManageIntegrationUseCase,
  ) {}

  @Get('products')
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string): Promise<StoreProduct[]> {
    return this.products.list(user.userId, q);
  }

  @Post('products')
  create(@CurrentUser() user: AuthUser, @Body() body: ProductDto): Promise<StoreProduct> {
    return this.products.create(user.userId, body);
  }

  @Post('products/import')
  @HttpCode(200)
  import(@CurrentUser() user: AuthUser, @Body() body: ImportDto): Promise<ImportProductsResult> {
    return this.products.import(user.userId, body.rows);
  }

  @Put('products/:sku')
  update(@CurrentUser() user: AuthUser, @Param('sku') sku: string, @Body() body: ProductDto): Promise<StoreProduct> {
    return this.products.update(user.userId, sku, body);
  }

  @HttpCode(204)
  @Delete('products/:sku')
  async remove(@CurrentUser() user: AuthUser, @Param('sku') sku: string): Promise<void> {
    await this.products.remove(user.userId, sku);
  }

  @Get('integration')
  getIntegration(@CurrentUser() user: AuthUser): Promise<StoreIntegrationInfo> {
    return this.integration.get(user.userId);
  }

  @Put('integration')
  saveIntegration(@CurrentUser() user: AuthUser, @Body() body: IntegrationDto): Promise<StoreIntegrationInfo> {
    return this.integration.save(user.userId, body);
  }

  @Post('integration/test')
  @HttpCode(200)
  testIntegration(@CurrentUser() user: AuthUser, @Body() body: IntegrationDto): Promise<IntegrationTestResult> {
    return this.integration.test(user.userId, body);
  }
}
