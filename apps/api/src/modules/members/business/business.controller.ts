import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import type { BusinessInfo, BusinessOrder, BusinessStatus, GeoPoint, StoreWallet, UpdateBusinessRequest } from '@parla/types';
import { Type } from 'class-transformer';
import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import {
  DecideBusinessOrderUseCase,
  GetBusinessOrderUseCase,
  GetBusinessStatusUseCase,
  GetMyBusinessUseCase,
  ListBusinessOrdersUseCase,
  UpdateMyBusinessUseCase,
} from '../../platform/services/use-cases/business-orders.use-cases';

import { GetStoreWalletUseCase, SetStorePayoutPhoneUseCase } from '../../platform/services/use-cases/store-wallet.use-cases';

class PayoutPhoneDto {
  @IsString() @MaxLength(30) phone: string;
}

class PointDto {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

class UpdateBusinessDto implements UpdateBusinessRequest {
  @IsOptional() @IsBoolean() acceptingOrders?: boolean;
  @IsOptional() @IsString() opensAt?: string;
  @IsOptional() @IsString() closesAt?: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @ValidateNested() @Type(() => PointDto) location?: GeoPoint | null;
}

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
    private readonly wallet: GetStoreWalletUseCase,
    private readonly setPayoutPhone: SetStorePayoutPhoneUseCase,
    private readonly listOrders: ListBusinessOrdersUseCase,
    private readonly getOrder: GetBusinessOrderUseCase,
    private readonly decide: DecideBusinessOrderUseCase,
    private readonly updateMine: UpdateMyBusinessUseCase,
    private readonly status: GetBusinessStatusUseCase,
  ) {}

  @Get()
  async mine(@CurrentUser() user: AuthUser): Promise<{ business: BusinessInfo | null }> {
    return { business: await this.myBusiness.execute(user.userId) };
  }

  /** Pausar o reanudar los pedidos y cambiar el horario. */
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateBusinessDto): Promise<BusinessInfo> {
    return this.updateMine.execute(user.userId, body);
  }

  /** Para cualquier cliente: si una tienda recibe pedidos ahora. */
  /** «Mis ventas y depósitos»: saldo, comisión de Parla, depósitos y el número de PagaYa. */
  @Get('wallet')
  myWallet(@CurrentUser() user: AuthUser): Promise<StoreWallet> {
    return this.wallet.execute(user.userId);
  }

  @Put('payout-phone')
  setPhone(@CurrentUser() user: AuthUser, @Body() body: PayoutPhoneDto): Promise<{ payoutPhone: string }> {
    return this.setPayoutPhone.execute(user.userId, body.phone);
  }

  @Get('status/:storeId')
  async statusOf(@Param('storeId') storeId: string): Promise<{ status: BusinessStatus | null }> {
    return { status: await this.status.execute(storeId) };
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
