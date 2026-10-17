import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type {
  Currency,
  DeliveryAddress,
  GeoPoint,
  InternalCreateOrder,
  InternalOrder,
  InternalUpdateOrder,
  OrderDelivery,
  OrderLine,
  OrderPayment,
  OrderStatus,
  ServiceId,
} from '@parla/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { MAX_TIP_CENTS, ORDER_STATUSES } from '../../../kernel/order-rules';
import { CreateOrderUseCase, GetInternalOrderUseCase, UpdateOrderUseCase } from './use-cases/orders.use-cases';

const MAX_CENTS = 10_000_000; // S/ 100 000: tope de cordura para un pedido de supermercado

class OrderLineDto implements OrderLine {
  @IsString() @IsNotEmpty() @MaxLength(64) productId: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsString() @MaxLength(40) unit: string;
  @IsInt() @Min(1) @Max(50) quantity: number;
  @IsInt() @Min(0) @Max(MAX_CENTS) unitPriceCents: number;
  @IsInt() @Min(0) @Max(MAX_CENTS) totalCents: number;
}

class GeoPointDto implements GeoPoint {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

class AddressDto implements DeliveryAddress {
  @IsString() @IsNotEmpty() @MaxLength(200) line: string;
  @IsString() @MaxLength(200) reference: string;
  @IsOptional() @ValidateNested() @Type(() => GeoPointDto) location?: GeoPointDto | null;
}

class PaymentDto implements OrderPayment {
  @IsString() @IsNotEmpty() @MaxLength(40) provider: string;
  @IsOptional() @IsString() @MaxLength(80) chargeId?: string;
  @IsString() @IsNotEmpty() @MaxLength(500) qrText: string;
  @IsString() @IsNotEmpty() @MaxLength(500) payUrl: string;
  @IsISO8601() expiresAt: string;
  @IsOptional() @IsISO8601() paidAt: string | null;
  @IsOptional() @IsISO8601() refundedAt?: string | null;
}

class DeliveryDto implements OrderDelivery {
  @IsString() @IsNotEmpty() @MaxLength(40) provider: string;
  @IsOptional() @IsString() @MaxLength(80) driverName: string | null;
  @IsOptional() @IsString() @MaxLength(80) vehicle: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(600) etaMinutes: number | null;
  @IsISO8601() updatedAt: string;
}

class CreateOrderDto implements InternalCreateOrder {
  @Matches(/^ord_[A-Za-z0-9]{8,40}$/) id: string;
  @IsString() @IsNotEmpty() @MaxLength(64) userId: string;
  @IsIn(['mercado', 'salud']) service: ServiceId;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => OrderLineDto) lines: OrderLineDto[];
  @IsInt() @Min(0) @Max(MAX_CENTS) subtotalCents: number;
  @IsInt() @Min(0) @Max(MAX_CENTS) deliveryFeeCents: number;
  @IsInt() @Min(0) @Max(MAX_TIP_CENTS) tipCents: number;
  @IsInt() @Min(1) @Max(MAX_CENTS) totalCents: number;
  @IsIn(['PEN']) currency: Currency;
  @ValidateNested() @Type(() => AddressDto) address: AddressDto;
  @ValidateNested() @Type(() => PaymentDto) payment: PaymentDto;
  @IsString() @IsNotEmpty() @MaxLength(64) deliveryQuoteId: string;
  @IsInt() @Min(1) @Max(600) etaMinutes: number;
}

class UpdateOrderDto implements InternalUpdateOrder {
  @IsOptional() @IsIn(ORDER_STATUSES) expectStatus?: OrderStatus;
  @IsIn(ORDER_STATUSES) status: OrderStatus;
  @IsOptional() @IsISO8601() paidAt?: string;
  @IsOptional() @IsISO8601() refundedAt?: string;
  @IsOptional() @ValidateNested() @Type(() => DeliveryDto) delivery?: DeliveryDto;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * Puerta del gateway (Go) hacia el core para los pedidos de Servicios. Solo entre servicios: token
 * interno, sin JWT de persona, y el gateway no la expone hacia fuera.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal/orders')
export class ServicesBridgeController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly getOrder: GetInternalOrderUseCase,
    private readonly updateOrder: UpdateOrderUseCase,
  ) {}

  @HttpCode(201)
  @Post()
  create(@Body() body: CreateOrderDto): Promise<InternalOrder> {
    return this.createOrder.execute(body);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<InternalOrder> {
    return this.getOrder.execute(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateOrderDto): Promise<InternalOrder> {
    return this.updateOrder.execute(id, body);
  }
}
