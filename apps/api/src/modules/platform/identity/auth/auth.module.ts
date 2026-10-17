import { Module } from '@nestjs/common';
import { VerificationModule } from '../verification/verification.module';
import { AuthController } from './auth.controller';
import { AUTH_REPOSITORY } from './auth.repository';
import { PrismaAuthRepository } from './prisma-auth.repository';
import { DeleteAccountUseCase, ExportAccountUseCase } from './use-cases/account-data.use-case';
import { ReadAvatarUseCase, RemoveAvatarUseCase, UploadAvatarUseCase } from './use-cases/avatar.use-case';
import { StartEmailVerificationUseCase, VerifyEmailUseCase } from './use-cases/email.use-case';
import { GetSessionUseCase } from './use-cases/get-session.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { MatchContactsUseCase } from './use-cases/match-contacts.use-case';
import { StartPhoneVerificationUseCase, VerifyPhoneUseCase } from './use-cases/phone-verification.use-case';
import { RegisterUserUseCase } from './use-cases/register-user.use-case';
import { SearchPeopleUseCase } from './use-cases/search-people.use-case';
import { ProfileEvents, UpdateProfileUseCase } from './use-cases/update-profile.use-case';

@Module({
  imports: [VerificationModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
    StartPhoneVerificationUseCase,
    VerifyPhoneUseCase,
    RegisterUserUseCase,
    LoginUseCase,
    GetSessionUseCase,
    ProfileEvents,
    UpdateProfileUseCase,
    StartEmailVerificationUseCase,
    VerifyEmailUseCase,
    UploadAvatarUseCase,
    RemoveAvatarUseCase,
    ReadAvatarUseCase,
    ExportAccountUseCase,
    DeleteAccountUseCase,
    SearchPeopleUseCase,
    MatchContactsUseCase,
  ],
  exports: [AUTH_REPOSITORY, SearchPeopleUseCase, MatchContactsUseCase],
})
export class AuthModule {}
