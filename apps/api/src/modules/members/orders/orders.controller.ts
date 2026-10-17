import { Controller, Get, Param } from '@nestjs/common';
import type { Order } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
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
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Order[]> {
    return this.listMine.execute(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Order> {
    return this.getMine.execute(user.userId, id);
  }
}
