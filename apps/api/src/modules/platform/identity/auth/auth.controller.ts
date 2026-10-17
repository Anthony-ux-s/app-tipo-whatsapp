import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { AccountExport, AuthResponse, SessionUser, VerificationProof, VerificationStarted } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../../http/current-user.decorator';
import { Public } from '../../../../http/public.decorator';
import {
  DeleteAccountDto,
  LoginDto,
  RegisterDto,
  StartEmailDto,
  StartPhoneDto,
  UpdateProfileDto,
  VerifyEmailDto,
  VerifyPhoneDto,
} from './dto/auth.dto';
import { DeleteAccountUseCase, ExportAccountUseCase } from './use-cases/account-data.use-case';
import { MAX_AVATAR_BYTES, ReadAvatarUseCase, RemoveAvatarUseCase, UploadAvatarUseCase } from './use-cases/avatar.use-case';
import { StartEmailVerificationUseCase, VerifyEmailUseCase } from './use-cases/email.use-case';
import { GetSessionUseCase } from './use-cases/get-session.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { StartPhoneVerificationUseCase, VerifyPhoneUseCase } from './use-cases/phone-verification.use-case';
import { RegisterUserUseCase } from './use-cases/register-user.use-case';
import { UpdateProfileUseCase } from './use-cases/update-profile.use-case';

@Controller()
export class AuthController {
  constructor(
    private readonly startPhone: StartPhoneVerificationUseCase,
    private readonly verifyPhone: VerifyPhoneUseCase,
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    private readonly getSession: GetSessionUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly startEmail: StartEmailVerificationUseCase,
    private readonly verifyEmail: VerifyEmailUseCase,
    private readonly uploadAvatar: UploadAvatarUseCase,
    private readonly removeAvatar: RemoveAvatarUseCase,
    private readonly readAvatar: ReadAvatarUseCase,
    private readonly exportAccount: ExportAccountUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  /**
   * Registro, paso 1: código por SMS al número (OneSignal). Límite por IP contra el envío masivo de
   * SMS a muchos números; además, cada número recibe como mucho 1 código por minuto y 5 por hora.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/phone/start')
  phoneStart(@Body() body: StartPhoneDto): Promise<VerificationStarted> {
    return this.startPhone.execute(body.phone);
  }

  /** Registro, paso 2: el código correcto entrega el comprobante. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/phone/verify')
  phoneVerify(@Body() body: VerifyPhoneDto): Promise<VerificationProof> {
    return this.verifyPhone.execute(body.phone, body.code);
  }

  /** Registro, paso 3: nombre, usuario opcional y contraseña. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/register')
  register(@Body() body: RegisterDto): Promise<AuthResponse> {
    return this.registerUser.execute(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/login')
  signIn(@Body() body: LoginDto): Promise<AuthResponse> {
    return this.login.execute(body);
  }

  @Get('auth/me')
  me(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    return this.getSession.execute(user.userId);
  }

  @Patch('auth/me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto): Promise<SessionUser> {
    return this.updateProfile.execute(user.userId, body);
  }

  /** Correo de recuperación: primero un código al correo… */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/me/email')
  emailStart(@CurrentUser() user: AuthUser, @Body() body: StartEmailDto): Promise<VerificationStarted> {
    return this.startEmail.execute(user.userId, body.email);
  }

  /** …y con el código correcto queda verificado. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/me/email/verify')
  emailVerify(@CurrentUser() user: AuthUser, @Body() body: VerifyEmailDto): Promise<SessionUser> {
    return this.verifyEmail.execute(user.userId, body.code);
  }

  @Post('auth/me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES } }))
  avatarUpload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined): Promise<SessionUser> {
    return this.uploadAvatar.execute(user.userId, file?.buffer);
  }

  @Delete('auth/me/avatar')
  avatarRemove(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    return this.removeAvatar.execute(user.userId);
  }

  /** Fotos de perfil: URL impredecible y sin sesión (van en <img>); nunca cambian, se guardan en caché. */
  @Public()
  @Get('avatars/:fileId')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async avatar(@Param('fileId') fileId: string): Promise<StreamableFile> {
    return new StreamableFile(await this.readAvatar.execute(fileId), { type: 'image/jpeg', disposition: 'inline' });
  }

  /** Descarga de los datos personales (derecho de acceso y portabilidad). */
  @Get('auth/me/export')
  export(@CurrentUser() user: AuthUser): Promise<AccountExport> {
    return this.exportAccount.execute(user.userId);
  }

  /** Eliminación de la cuenta (derecho de supresión). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Delete('auth/me')
  remove(@CurrentUser() user: AuthUser, @Body() body: DeleteAccountDto): Promise<void> {
    return this.deleteAccount.execute(user.userId, body.password);
  }
}
