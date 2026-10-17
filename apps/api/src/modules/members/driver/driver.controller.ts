import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { DriverInfo, DriverOrder, DriverOrders } from '@parla/types';
import { IsString, Matches } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import {
  AcceptDeliveryUseCase,
  DeliverOrderUseCase,
  GetDriverOrderUseCase,
  GetMyDriverUseCase,
  ListDriverOrdersUseCase,
  ReleaseDeliveryUseCase,
} from '../../platform/services/use-cases/driver-orders.use-cases';

class DeliverDto {
  @IsString() @Matches(/^\s*\d{4}\s*$/, { message: 'El código tiene 4 dígitos' }) code: string;
}

/**
 * Rapidito para repartidores: los pedidos listos para recoger, tomar uno, y entregarlo con el código
 * del cliente. La tienda confirma la recogida desde «Mi negocio».
 */
@Controller('driver')
export class DriverController {
  constructor(
    private readonly myDriver: GetMyDriverUseCase,
    private readonly listOrders: ListDriverOrdersUseCase,
    private readonly getOrder: GetDriverOrderUseCase,
    private readonly accept: AcceptDeliveryUseCase,
    private readonly deliver: DeliverOrderUseCase,
    private readonly release: ReleaseDeliveryUseCase,
  ) {}

  @Get()
  async mine(@CurrentUser() user: AuthUser): Promise<{ driver: DriverInfo | null }> {
    return { driver: await this.myDriver.execute(user.userId) };
  }

  @Get('orders')
  list(@CurrentUser() user: AuthUser): Promise<DriverOrders> {
    return this.listOrders.execute(user.userId);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<DriverOrder> {
    return this.getOrder.execute(user.userId, id);
  }

  @HttpCode(200)
  @Post('orders/:id/accept')
  take(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<DriverOrder> {
    return this.accept.execute(user.userId, id);
  }

  /** «No puedo llevarlo»: suelta el pedido antes de recogerlo y vuelve a ofrecerse. */
  @HttpCode(200)
  @Post('orders/:id/release')
  drop(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<DriverOrder> {
    return this.release.execute(user.userId, id);
  }

  @HttpCode(200)
  @Post('orders/:id/deliver')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: DeliverDto): Promise<DriverOrder> {
    return this.deliver.execute(user.userId, id, body.code);
  }
}
