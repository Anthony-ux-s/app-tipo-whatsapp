import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { AdminStore, ReviewStoreRequest, StoreStatus } from '@parla/types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { ListAdminStoresUseCase, ReviewStoreUseCase } from '../../platform/stores/stores.use-cases';

const STATUSES: StoreStatus[] = ['pending', 'approved', 'rejected', 'suspended'];

class ReviewDto implements ReviewStoreRequest {
  @IsIn(['approve', 'reject', 'suspend', 'reactivate']) action: ReviewStoreRequest['action'];
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/** Soporte: las tiendas que piden entrar a Parla y su estado. */
@Controller('admin/stores')
export class AdminStoresController {
  constructor(
    private readonly list: ListAdminStoresUseCase,
    private readonly review: ReviewStoreUseCase,
  ) {}

  @Get()
  stores(@CurrentUser() user: AuthUser, @Query('status') status?: string): Promise<AdminStore[]> {
    return this.list.execute(user.userId, STATUSES.includes(status as StoreStatus) ? (status as StoreStatus) : undefined);
  }

  @HttpCode(200)
  @Post(':id/review')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: ReviewDto): Promise<AdminStore> {
    return this.review.execute(user.userId, id, body);
  }
}
