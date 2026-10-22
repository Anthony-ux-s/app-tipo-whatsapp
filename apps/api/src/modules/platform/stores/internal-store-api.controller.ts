import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { StoreProduct } from '@parla/types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';
import { InternalApiKeyGuard } from '../../../http/internal-api-key.guard';
import { Public } from '../../../http/public.decorator';
import { StoreApiUseCase } from './store-api.use-cases';

/** El producto con los nombres de la API de tienda de Parla (los mismos de MercaYa). */
function producto(p: StoreProduct) {
  return { sku: p.sku, nombre: p.name, presentacion: p.unit, precio_centimos: p.priceCents, stock: p.stock, categoria: p.category, imagen: p.imageUrl, precio_antes_centimos: p.listPriceCents };
}

class LineaDto {
  @IsString() @MaxLength(64) sku: string;
  @IsInt() @Min(1) @Max(1000) cantidad: number;
}

class PedidoDto {
  @IsString() @MaxLength(64) referencia: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineaDto) lineas: LineaDto[];
}

class PatchProductoDto {
  @IsOptional() @IsInt() @Min(1) precio_centimos?: number;
  @IsOptional() @IsInt() precio_antes_centimos?: number | null;
  @IsOptional() @IsInt() @Min(0) stock?: number;
}

/**
 * La API de tienda de Parla para las tiendas que usan el catálogo de Parla. El gateway la llama como a
 * cualquier tienda: catálogo, producto, reserva de stock de un pedido y anulación. Solo entre servicios.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/store-api/:storeId')
export class InternalStoreApiController {
  constructor(
    private readonly api: StoreApiUseCase,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get('catalogo')
  async catalogo(@Param('storeId') storeId: string, @Query('buscar') buscar = ''): Promise<{ resultados: ReturnType<typeof producto>[] }> {
    return { resultados: (await this.api.search(storeId, buscar)).map(producto) };
  }

  @Get('productos/:sku')
  async producto(@Param('storeId') storeId: string, @Param('sku') sku: string) {
    return producto(await this.api.product(storeId, sku));
  }

  /** Precio, oferta o stock desde la pantalla de catálogo del dueño (exige la clave de administración). */
  @Patch('productos/:sku')
  async cambiar(@Param('storeId') storeId: string, @Param('sku') sku: string, @Headers('x-mercaya-clave') clave: string | undefined, @Body() body: PatchProductoDto) {
    const given = Buffer.from(clave ?? '');
    const expected = Buffer.from(this.env.internalToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException('Clave de administración inválida');
    return producto(
      await this.api.patch(storeId, sku, {
        ...(body.precio_centimos !== undefined ? { priceCents: body.precio_centimos } : {}),
        ...(body.precio_antes_centimos !== undefined ? { listPriceCents: body.precio_antes_centimos } : {}),
        ...(body.stock !== undefined ? { stock: body.stock } : {}),
      }),
    );
  }

  /** Aparta el stock del pedido: 201 reservado · 409 sin stock · 422 producto desconocido. */
  @Post('pedidos')
  async reservar(@Param('storeId') storeId: string, @Body() body: PedidoDto, @Res({ passthrough: true }) res: Response) {
    const outcome = await this.api.reserve(
      storeId,
      body.referencia,
      body.lineas.map((l) => ({ sku: l.sku, quantity: l.cantidad })),
    );
    if (outcome.ok) {
      res.status(201);
      return { estado: 'RESERVADO' };
    }
    res.status(outcome.reason === 'OUT_OF_STOCK' ? 409 : 422);
    return { error: outcome.reason === 'OUT_OF_STOCK' ? 'SIN_STOCK' : 'PRODUCTO_DESCONOCIDO', sku: outcome.sku };
  }

  @HttpCode(200)
  @Delete('pedidos/:referencia')
  async anular(@Param('storeId') storeId: string, @Param('referencia') referencia: string, @Res({ passthrough: true }) res: Response) {
    const released = await this.api.release(storeId, referencia);
    if (!released) res.status(404);
    return { estado: released ? 'ANULADO' : 'NO_EXISTE' };
  }
}
