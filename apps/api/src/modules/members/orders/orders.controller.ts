import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { Order, OrderContactRole, PublicUser, RateOrderRequest } from '@parla/types';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetOrderContactUseCase } from '../../platform/services/use-cases/business-orders.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase, RateOrderUseCase, RenewDeliveryCodeUseCase } from '../../platform/services/use-cases/orders.use-cases';

class RateOrderDto implements RateOrderRequest {
  @IsOptional() @IsInt() @Min(1) @Max(5) driverStars?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(5) storeStars?: number | null;
  @IsOptional() @IsString() @MaxLength(300) comment?: string;
}

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
    private readonly rate: RateOrderUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Order[]> {
    return this.listMine.execute(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Order> {
    return this.getMine.execute(user.userId, id);
  }

  /** Calificar al repartidor y a la tienda al recibir el pedido (una vez). */
  @HttpCode(200)
  @Post(':id/rating')
  rateOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RateOrderDto): Promise<Order> {
    return this.rate.execute(user.userId, id, body);
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
