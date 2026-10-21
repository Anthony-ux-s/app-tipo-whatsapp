import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, StreamableFile } from '@nestjs/common';
import type { AdminClaim, AdminCoupon, AdminDriver, AdminOrder, CouponKind, CreateCouponRequest, DriverStatus } from '@parla/types';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetDriverDocumentUseCase, ListDriversForReviewUseCase, ReviewDriverUseCase } from '../../platform/services/use-cases/admin-drivers.use-cases';
import { GetAdminClaimUseCase, ListAdminClaimsUseCase, RejectClaimUseCase } from '../../platform/services/use-cases/claims.use-cases';
import { ReadPhotoUseCase } from '../../platform/services/use-cases/photos.use-cases';
import { ADMIN_ORDER_VIEWS, GetAdminOrderUseCase, ListAdminOrdersUseCase, type AdminOrdersView } from '../../platform/services/use-cases/admin-orders.use-cases';
import { CreateCouponUseCase, ListCouponsUseCase, SetCouponActiveUseCase } from '../../platform/services/use-cases/coupons.use-cases';

class ReviewDriverDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class CreateCouponDto implements CreateCouponRequest {
  @IsString() @MaxLength(20) code: string;
  @IsString() @MaxLength(120) description: string;
  @IsIn(['percent', 'amount', 'free_delivery']) kind: CouponKind;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) value?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) maxDiscountCents?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) minSubtotalCents?: number;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(100) perUserLimit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) maxUses?: number | null;
  @IsOptional() @IsISO8601() endsAt?: string | null;
}

class CouponActiveDto {
  @IsBoolean() active: boolean;
}

class RejectClaimDto {
  @IsString() @MaxLength(300) note: string;
}

/**
 * Panel de soporte (solo cuentas con isAdmin): aprobar o rechazar repartidores y resolver reclamos.
 * La devolución de un reclamo (POST /api/admin/claims/:id/refund) la hace el gateway con PagaYa.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly listDrivers: ListDriversForReviewUseCase,
    private readonly review: ReviewDriverUseCase,
    private readonly document: GetDriverDocumentUseCase,
    private readonly listClaims: ListAdminClaimsUseCase,
    private readonly getClaim: GetAdminClaimUseCase,
    private readonly reject: RejectClaimUseCase,
    private readonly readPhoto: ReadPhotoUseCase,
    private readonly listOrders: ListAdminOrdersUseCase,
    private readonly getOrder: GetAdminOrderUseCase,
    private readonly listCoupons: ListCouponsUseCase,
    private readonly createCoupon: CreateCouponUseCase,
    private readonly setCouponActive: SetCouponActiveUseCase,
  ) {}

  /** Todos los pedidos: en curso, entregados o cerrados; se busca por id, nombre o teléfono del cliente. */
  @Get('orders')
  orders(@CurrentUser() user: AuthUser, @Query('view') view?: string, @Query('q') q?: string): Promise<AdminOrder[]> {
    const v = (view && view in ADMIN_ORDER_VIEWS ? view : 'active') as AdminOrdersView;
    return this.listOrders.execute(user.userId, v, q ?? '');
  }

  @Get('orders/:id')
  order(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AdminOrder> {
    return this.getOrder.execute(user.userId, id);
  }

  @Get('coupons')
  coupons(@CurrentUser() user: AuthUser): Promise<AdminCoupon[]> {
    return this.listCoupons.execute(user.userId);
  }

  @HttpCode(201)
  @Post('coupons')
  newCoupon(@CurrentUser() user: AuthUser, @Body() body: CreateCouponDto): Promise<AdminCoupon> {
    return this.createCoupon.execute(user.userId, body);
  }

  @HttpCode(200)
  @Post('coupons/:code/active')
  couponActive(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() body: CouponActiveDto): Promise<AdminCoupon> {
    return this.setCouponActive.execute(user.userId, code, body.active);
  }

  @Get('drivers')
  drivers(@CurrentUser() user: AuthUser, @Query('status') status?: string): Promise<AdminDriver[]> {
    const s = (['pending', 'approved', 'rejected'].includes(status ?? '') ? status : 'pending') as DriverStatus;
    return this.listDrivers.execute(user.userId, s);
  }

  @HttpCode(200)
  @Post('drivers/:userId/review')
  reviewDriver(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() body: ReviewDriverDto): Promise<AdminDriver> {
    return this.review.execute(user.userId, userId, body.decision, body.note ?? '');
  }

  @Get('drivers/:userId/document')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async driverDocument(@CurrentUser() user: AuthUser, @Param('userId') userId: string): Promise<StreamableFile> {
    const photoId = await this.document.execute(user.userId, userId);
    return new StreamableFile(await this.readPhoto.execute(photoId), { type: 'image/jpeg', disposition: 'inline' });
  }

  @Get('claims')
  claims(@CurrentUser() user: AuthUser, @Query('view') view?: string): Promise<AdminClaim[]> {
    return this.listClaims.execute(user.userId, view === 'resolved' ? 'resolved' : 'open');
  }

  @Get('claims/:id')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AdminClaim> {
    return this.getClaim.execute(user.userId, id);
  }

  @HttpCode(200)
  @Post('claims/:id/reject')
  rejectClaim(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RejectClaimDto): Promise<AdminClaim> {
    return this.reject.execute(user.userId, id, body.note);
  }
}
