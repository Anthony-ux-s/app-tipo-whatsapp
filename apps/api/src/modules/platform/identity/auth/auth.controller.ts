import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccountExport, AuthResponse, SessionUser } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../../http/current-user.decorator';
import { Public } from '../../../../http/public.decorator';
import { DeleteAccountDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import { DeleteAccountUseCase, ExportAccountUseCase } from './use-cases/account-data.use-case';
import { GetSessionUseCase } from './use-cases/get-session.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { RegisterUserUseCase } from './use-cases/register-user.use-case';
import { UpdateProfileUseCase } from './use-cases/update-profile.use-case';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    private readonly getSession: GetSessionUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly exportAccount: ExportAccountUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() body: RegisterDto): Promise<AuthResponse> {
    return this.registerUser.execute(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  signIn(@Body() body: LoginDto): Promise<AuthResponse> {
    return this.login.execute(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    return this.getSession.execute(user.userId);
  }

  /** Descarga de los datos personales (derecho de acceso y portabilidad). */
  @Get('me/export')
  export(@CurrentUser() user: AuthUser): Promise<AccountExport> {
    return this.exportAccount.execute(user.userId);
  }

  /** Eliminación de la cuenta (derecho de supresión). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Delete('me')
  remove(@CurrentUser() user: AuthUser, @Body() body: DeleteAccountDto): Promise<void> {
    return this.deleteAccount.execute(user.userId, body.password);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto): Promise<SessionUser> {
    return this.updateProfile.execute(user.userId, body);
  }
}
