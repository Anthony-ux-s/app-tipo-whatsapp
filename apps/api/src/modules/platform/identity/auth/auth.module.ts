import { Module } from '@nestjs/common';
import { DeleteAccountUseCase, ExportAccountUseCase } from './use-cases/account-data.use-case';
import { AuthController } from './auth.controller';
import { AUTH_REPOSITORY } from './auth.repository';
import { PrismaAuthRepository } from './prisma-auth.repository';
import { GetSessionUseCase } from './use-cases/get-session.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { RegisterUserUseCase } from './use-cases/register-user.use-case';
import { SearchPeopleUseCase } from './use-cases/search-people.use-case';
import { UpdateProfileUseCase } from './use-cases/update-profile.use-case';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
    RegisterUserUseCase,
    LoginUseCase,
    GetSessionUseCase,
    UpdateProfileUseCase,
    ExportAccountUseCase,
    DeleteAccountUseCase,
    SearchPeopleUseCase,
  ],
  exports: [AUTH_REPOSITORY, SearchPeopleUseCase],
})
export class AuthModule {}
