import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { Order, OrderContactRole, PublicUser } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetOrderContactUseCase } from '../../platform/services/use-cases/business-orders.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase, RenewDeliveryCodeUseCase } from '../../platform/services/use-cases/orders.use-cases';

/**
 * «Mis pedidos». Crear un pedido no pasa por aquí: lo orquesta el gateway con la tienda, el delivery
 * y la pasarela (POST /api/services/mercado/orders).
 */
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly listMine: ListMyOrdersUseCase,
    private readonly getMine: GetMyOrderUseCase,
    private readonly getContact: GetOrderContactUseCase,
    private readonly renewCode: RenewDeliveryCodeUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Order[]> {
    return this.listMine.execute(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Order> {
    return this.getMine.execute(user.userId, id);
  }

  /** Código de entrega nuevo cuando el anterior se bloqueó por intentos equivocados. */
  @HttpCode(200)
  @Post(':id/new-code')
  newCode(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Order> {
    return this.renewCode.execute(user.userId, id);
  }

  /** Con quién chatear sobre el pedido (?with=business|customer|driver), si participas en él. */
  @Get(':id/contact')
  contact(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('with') withRole: OrderContactRole): Promise<PublicUser> {
    return this.getContact.execute(user.userId, id, withRole);
  }
}
