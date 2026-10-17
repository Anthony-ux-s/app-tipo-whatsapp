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
 * «Mi negocio»: el dueño ve los pedidos que recibe, los acepta, avisa cuando están listos (se ofrecen
 * a los repartidores de Rapidito), confirma que se los entregó al repartidor o pide otro repartidor.
 * Rechazar y cancelar (POST /api/business/orders/:id/reject|cancel) los atiende el gateway, que
 * devuelve el pago en la billetera.
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

  /** El repartidor asignado no llega: se suelta y el pedido se ofrece a otro. */
  @HttpCode(200)
  @Post('orders/:id/reassign')
  reassign(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<BusinessOrder> {
    return this.decide.execute(user.userId, id, 'reassign');
  }
}
