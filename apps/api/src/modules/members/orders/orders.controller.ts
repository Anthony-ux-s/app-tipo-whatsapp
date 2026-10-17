import { Controller, Get, Param } from '@nestjs/common';
import type { Order, PublicUser } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetOrderContactUseCase } from '../../platform/services/use-cases/business-orders.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase } from '../../platform/services/use-cases/orders.use-cases';

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
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Order[]> {
    return this.listMine.execute(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Order> {
    return this.getMine.execute(user.userId, id);
  }

  /** Con quién chatear sobre el pedido: el negocio (si eres el cliente) o el cliente (si eres el dueño). */
  @Get(':id/contact')
  contact(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PublicUser> {
    return this.getContact.execute(user.userId, id);
  }
}
