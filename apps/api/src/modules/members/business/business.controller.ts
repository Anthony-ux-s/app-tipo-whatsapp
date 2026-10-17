import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { BusinessInfo, BusinessOrder } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import {
  DecideBusinessOrderUseCase,
  GetBusinessOrderUseCase,
  GetMyBusinessUseCase,
  ListBusinessOrdersUseCase,
} from '../../platform/services/use-cases/business-orders.use-cases';

/**
 * «Mi negocio»: el dueño ve los pedidos que recibe, los acepta o los rechaza. Marcarlo como listo
 * (POST /api/business/orders/:id/ready) lo atiende el gateway, que despacha a Rapidito.
 */
@Controller('business')
export class BusinessController {
  constructor(
    private readonly myBusiness: GetMyBusinessUseCase,
    private readonly listOrders: ListBusinessOrdersUseCase,
    private readonly getOrder: GetBusinessOrderUseCase,
    private readonly decide: DecideBusinessOrderUseCase,
  ) {}

  @Get()
  async mine(@CurrentUser() user: AuthUser): Promise<{ business: BusinessInfo | null }> {
    return { business: await this.myBusiness.execute(user.userId) };
  }

  @Get('orders')
  list(@CurrentUser() user: AuthUser): Promise<BusinessOrder[]> {
    return this.listOrders.execute(user.userId);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<BusinessOrder> {
    return this.getOrder.execute(user.userId, id);
  }

  @HttpCode(200)
  @Post('orders/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<BusinessOrder> {
    return this.decide.execute(user.userId, id, 'accept');
  }

  @HttpCode(200)
  @Post('orders/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<BusinessOrder> {
    return this.decide.execute(user.userId, id, 'reject');
  }
}
