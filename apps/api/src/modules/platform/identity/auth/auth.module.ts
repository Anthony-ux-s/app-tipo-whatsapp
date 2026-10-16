import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AUTH_REPOSITORY } from './auth.repository';
import { PrismaAuthRepository } from './prisma-auth.repository';
import { GetSessionUseCase } from './use-cases/get-session.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { RegisterUserUseCase } from './use-cases/register-user.use-case';
import { UpdateProfileUseCase } from './use-cases/update-profile.use-case';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
    RegisterUserUseCase,
    LoginUseCase,
    GetSessionUseCase,
    UpdateProfileUseCase,
  ],
  exports: [AUTH_REPOSITORY],
})
export class AuthModule {}
