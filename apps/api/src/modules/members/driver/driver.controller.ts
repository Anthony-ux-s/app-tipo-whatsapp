import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, StreamableFile } from '@nestjs/common';
import type { DriverEarnings, DriverInfo, DriverOrder, DriverOrders, DriverProfileRequest, DriverVehicle, DriverWallet, GeoPoint } from '@parla/types';
import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import {
  AcceptDeliveryUseCase,
  DeliverOrderUseCase,
  GetDriverOrderUseCase,
  GetMyDriverUseCase,
  ListDriverOrdersUseCase,
  ReleaseDeliveryUseCase,
} from '../../platform/services/use-cases/driver-orders.use-cases';
import {
  GetDriverEarningsUseCase,
  LeaveDriverUseCase,
  RegisterDriverUseCase,
  ReportDriverLocationUseCase,
  SetDriverOnlineUseCase,
  UpdateDriverProfileUseCase,
  SetDriverDocumentUseCase,
} from '../../platform/services/use-cases/driver-profile.use-cases';
import { GetDriverDocumentUseCase } from '../../platform/services/use-cases/admin-drivers.use-cases';
import { ReadPhotoUseCase } from '../../platform/services/use-cases/photos.use-cases';
import { GetDriverWalletUseCase, SetPayoutPhoneUseCase } from '../../platform/services/use-cases/driver-wallet.use-cases';

class DeliverDto {
  @IsOptional() @IsString() @Matches(/^\s*\d{4}\s*$/, { message: 'El código tiene 4 dígitos' }) code?: string;
  @IsOptional() @IsString() @MaxLength(40) photoId?: string;
}

class DocumentDto {
  @IsString() @MaxLength(40) photoId: string;
}

class DriverProfileDto implements DriverProfileRequest {
  @IsString() @MaxLength(20) vehicle: DriverVehicle;
  @IsOptional() @IsString() @MaxLength(12) plate?: string;
  @IsOptional() @IsString() @MaxLength(12) dniNumber?: string;
  @IsOptional() @IsString() @MaxLength(14) licenseNumber?: string;
}

class OnlineDto {
  @IsBoolean() online: boolean;
}

class PayoutAccountDto {
  @IsString() @MaxLength(20) phone: string;
}

class LocationDto implements GeoPoint {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

/**
 * Rapidito para repartidores: registrarse, su perfil (vehículo, conectado, dejar de repartir) y
 * ganancias; los pedidos listos para recoger, tomar uno, soltarlo y entregarlo con el código del
 * cliente; y la ubicación en vivo mientras reparte. La tienda confirma la recogida desde «Mi negocio».
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
    private readonly register: RegisterDriverUseCase,
    private readonly updateProfile: UpdateDriverProfileUseCase,
    private readonly setOnline: SetDriverOnlineUseCase,
    private readonly leave: LeaveDriverUseCase,
    private readonly earnings: GetDriverEarningsUseCase,
    private readonly reportLocation: ReportDriverLocationUseCase,
    private readonly wallet: GetDriverWalletUseCase,
    private readonly setPayoutPhone: SetPayoutPhoneUseCase,
    private readonly setDocument: SetDriverDocumentUseCase,
    private readonly document: GetDriverDocumentUseCase,
    private readonly readPhoto: ReadPhotoUseCase,
  ) {}

  @Get()
  async mine(@CurrentUser() user: AuthUser): Promise<{ driver: DriverInfo | null }> {
    return { driver: await this.myDriver.execute(user.userId) };
  }

  /** «Trabaja con Rapidito». */
  @HttpCode(201)
  @Post()
  signUp(@CurrentUser() user: AuthUser, @Body() body: DriverProfileDto): Promise<DriverInfo> {
    return this.register.execute(user.userId, body);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() body: DriverProfileDto): Promise<DriverInfo> {
    return this.updateProfile.execute(user.userId, body);
  }

  /** Foto del documento (DNI o licencia) para la verificación de soporte. */
  @HttpCode(200)
  @Post('document')
  uploadDocument(@CurrentUser() user: AuthUser, @Body() body: DocumentDto): Promise<DriverInfo> {
    return this.setDocument.execute(user.userId, body.photoId);
  }

  @Get('document')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async myDocument(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    return new StreamableFile(await this.readPhoto.execute(await this.document.execute(user.userId, user.userId)), { type: 'image/jpeg', disposition: 'inline' });
  }

  @HttpCode(200)
  @Post('online')
  online(@CurrentUser() user: AuthUser, @Body() body: OnlineDto): Promise<DriverInfo> {
    return this.setOnline.execute(user.userId, body.online);
  }

  /** «Dejar de repartir» (sus entregas quedan en el historial). */
  @HttpCode(204)
  @Delete()
  async quit(@CurrentUser() user: AuthUser): Promise<void> {
    await this.leave.execute(user.userId);
  }

  @Get('earnings')
  earned(@CurrentUser() user: AuthUser): Promise<DriverEarnings> {
    return this.earnings.execute(user.userId);
  }

  /**
   * Saldo (95 % de las tarifas + propinas, ya descontada la comisión), número de PagaYa y movimientos.
   * Retirar (POST /api/driver/payouts) lo atiende el gateway, que transfiere con PagaYa.
   */
  @Get('wallet')
  myWallet(@CurrentUser() user: AuthUser): Promise<DriverWallet> {
    return this.wallet.execute(user.userId);
  }

  @Patch('payout-account')
  payoutAccount(@CurrentUser() user: AuthUser, @Body() body: PayoutAccountDto): Promise<{ payoutPhone: string }> {
    return this.setPayoutPhone.execute(user.userId, body.phone);
  }

  /** Ubicación del celular mientras reparte; solo la ven el cliente y la tienda del pedido. */
  @HttpCode(200)
  @Post('location')
  location(@CurrentUser() user: AuthUser, @Body() body: LocationDto): Promise<{ shared: number }> {
    return this.reportLocation.execute(user.userId, { lat: body.lat, lng: body.lng });
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
    return this.deliver.execute(user.userId, id, body);
  }
}
