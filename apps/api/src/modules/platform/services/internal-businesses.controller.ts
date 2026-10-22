import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { GetInternalBusinessUseCase, type InternalBusiness } from './use-cases/business-orders.use-cases';

/**
 * Para el gateway: si la tienda recibe pedidos ahora (antes de cotizar o cobrar) y quién es su dueño
 * (para administrar el catálogo en la tienda). Solo entre servicios, con el token interno.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal/businesses')
export class InternalBusinessesController {
  constructor(private readonly business: GetInternalBusinessUseCase) {}

  /** La clave de tienda es su id (la ruta se llama by-service por compatibilidad con el gateway). */
  @Get('by-service/:storeId')
  byStore(@Param('storeId') storeId: string): Promise<InternalBusiness> {
    return this.business.execute('store', storeId);
  }

  @Get('by-owner/:userId')
  byOwner(@Param('userId') userId: string): Promise<InternalBusiness> {
    return this.business.execute('owner', userId);
  }
}
