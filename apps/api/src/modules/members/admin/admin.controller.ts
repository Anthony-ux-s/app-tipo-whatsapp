import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, StreamableFile } from '@nestjs/common';
import type { AdminClaim, AdminDriver, DriverStatus } from '@parla/types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { GetDriverDocumentUseCase, ListDriversForReviewUseCase, ReviewDriverUseCase } from '../../platform/services/use-cases/admin-drivers.use-cases';
import { GetAdminClaimUseCase, ListAdminClaimsUseCase, RejectClaimUseCase } from '../../platform/services/use-cases/claims.use-cases';
import { ReadPhotoUseCase } from '../../platform/services/use-cases/photos.use-cases';

class ReviewDriverDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
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
  ) {}

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
