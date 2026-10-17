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
 * «Mi negocio»: el dueño ve los pedidos que recibe, los acepta o los rechaza, avisa cuando están
 * listos (se ofrecen a los repartidores de Rapidito) y confirma que se los entregó al repartidor.
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

  @HttpCode(200)
  @Post('orders/:id/ready')
  ready(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<BusinessOrder> {
    return this.decide.execute(user.userId, id, 'ready');
  }

  /** La tienda confirma que le entregó el pedido al repartidor (como «Despachado» en PedidosYa). */
  @HttpCode(200)
  @Post('orders/:id/handoff')
  handoff(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<BusinessOrder> {
    return this.decide.execute(user.userId, id, 'handoff');
  }
}
