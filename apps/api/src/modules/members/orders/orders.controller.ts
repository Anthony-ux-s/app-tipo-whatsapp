import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, StreamableFile } from '@nestjs/common';
import type { ClaimReason, CreateClaimRequest, Order, OrderClaim, OrderContactRole, PublicUser, RateOrderRequest } from '@parla/types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, ValidateNested } from 'class-validator';
import { CreateClaimUseCase } from '../../platform/services/use-cases/claims.use-cases';
import { GetOrderPhotoUseCase, ReadPhotoUseCase } from '../../platform/services/use-cases/photos.use-cases';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetOrderContactUseCase } from '../../platform/services/use-cases/business-orders.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase, RateOrderUseCase, RenewDeliveryCodeUseCase } from '../../platform/services/use-cases/orders.use-cases';

class ClaimItemDto {
  @IsString() @MaxLength(64) productId: string;
  @IsInt() @Min(1) @Max(50) quantity: number;
}

class CreateClaimDto implements CreateClaimRequest {
  @IsIn(['missing_items', 'damaged', 'wrong_items', 'not_delivered', 'other']) reason: ClaimReason;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ClaimItemDto) items?: ClaimItemDto[];
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
  @IsOptional() @IsString() @MaxLength(40) photoId?: string;
}

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
    private readonly createClaim: CreateClaimUseCase,
    private readonly orderPhoto: GetOrderPhotoUseCase,
    private readonly readPhoto: ReadPhotoUseCase,
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

  /** «Tengo un problema con mi pedido»: reclamo hasta 48 h después de recibirlo. */
  @HttpCode(201)
  @Post(':id/claims')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CreateClaimDto): Promise<OrderClaim> {
    return this.createClaim.execute(user.userId, id, body);
  }

  /** Foto de la entrega (cliente, tienda, repartidor del pedido y soporte). */
  @Get(':id/delivery-photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async deliveryPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<StreamableFile> {
    const photoId = await this.orderPhoto.execute(user.userId, id);
    return new StreamableFile(await this.readPhoto.execute(photoId), { type: 'image/jpeg', disposition: 'inline' });
  }

  /** Foto de un reclamo (cliente, tienda y soporte). */
  @Get(':id/claims/:claimId/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async claimPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('claimId') claimId: string): Promise<StreamableFile> {
    const photoId = await this.orderPhoto.execute(user.userId, id, claimId);
    return new StreamableFile(await this.readPhoto.execute(photoId), { type: 'image/jpeg', disposition: 'inline' });
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
