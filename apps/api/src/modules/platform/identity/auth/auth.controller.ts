import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthResponse, SessionUser } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../../http/current-user.decorator';
import { Public } from '../../../../http/public.decorator';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
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

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto): Promise<SessionUser> {
    return this.updateProfile.execute(user.userId, body);
  }
}
