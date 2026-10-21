import type {
  ChatFont,
  ChatFontSize,
  DeleteAccountRequest,
  EncryptedKeyBackup,
  ForgotPasswordRequest,
  LoginRequest,
  MatchContactsRequest,
  RegisterRequest,
  ResetPasswordRequest,
  StartEmailVerificationRequest,
  StartPhoneVerificationRequest,
  ThemePreference,
  UpdateProfileRequest,
  UserPreferences,
  VerifyEmailRequest,
  VerifyPhoneRequest,
  VerifyResetCodeRequest,
} from '@parla/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class KeyBackupDto implements EncryptedKeyBackup {
  @IsString() @IsNotEmpty() @MaxLength(4000) ciphertext: string;
  @IsString() @IsNotEmpty() @MaxLength(64) iv: string;
  @IsString() @IsNotEmpty() @MaxLength(64) salt: string;
  @IsInt() @Min(1000) iterations: number;
}

export class StartPhoneDto implements StartPhoneVerificationRequest {
  @IsString() @IsNotEmpty({ message: 'Escribe tu número' }) @MaxLength(24) phone: string;
}

export class VerifyPhoneDto implements VerifyPhoneRequest {
  @IsString() @IsNotEmpty() @MaxLength(24) phone: string;
  @IsString() @IsNotEmpty({ message: 'Escribe el código' }) @MaxLength(12) code: string;
}

export class RegisterDto implements RegisterRequest {
  @IsString() @IsNotEmpty() @MaxLength(100) verificationToken: string;
  @IsOptional() @IsString() @MaxLength(30) username?: string;
  @IsString() @MaxLength(60) displayName: string;
  @IsString() @MaxLength(128) password: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) publicKey: string;
  @ValidateNested() @Type(() => KeyBackupDto) keyBackup: KeyBackupDto;
  @IsBoolean() acceptTerms: boolean;
}

export class DeleteAccountDto implements DeleteAccountRequest {
  @IsString() @IsNotEmpty({ message: 'Escribe tu contraseña para confirmar' }) @MaxLength(128) password: string;
}

export class LoginDto implements LoginRequest {
  @IsString() @IsNotEmpty({ message: 'Escribe tu usuario o teléfono' }) @MaxLength(30) identifier: string;
  @IsString() @IsNotEmpty({ message: 'Escribe tu contraseña' }) @MaxLength(128) password: string;
}

class PreferencesDto implements Partial<UserPreferences> {
  @IsOptional() @IsIn(['light', 'dark', 'system']) theme?: ThemePreference;
  @IsOptional() @IsBoolean() enterToSend?: boolean;
  @IsOptional() @IsBoolean() notificationSound?: boolean;
  @IsOptional() @IsBoolean() chatEffects?: boolean;
  @IsOptional() @IsIn(['small', 'medium', 'large', 'xlarge']) chatFontSize?: ChatFontSize;
  @IsOptional() @IsIn(['inter', 'jakarta', 'serif', 'mono']) chatFont?: ChatFont;
}

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional() @IsString() @MaxLength(60) displayName?: string;
  @IsOptional() @IsString() @MaxLength(30) username?: string;
  @IsOptional() @IsString() @MaxLength(140) about?: string;
  @IsOptional() @IsString() @MaxLength(20) avatarColor?: string;
  @IsOptional() @ValidateNested() @Type(() => PreferencesDto) preferences?: PreferencesDto;
}

export class StartEmailDto implements StartEmailVerificationRequest {
  @IsString() @IsNotEmpty({ message: 'Escribe tu correo' }) @MaxLength(254) email: string;
}

export class VerifyEmailDto implements VerifyEmailRequest {
  @IsString() @IsNotEmpty({ message: 'Escribe el código' }) @MaxLength(12) code: string;
}

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @IsString() @IsNotEmpty({ message: 'Escribe tu correo' }) @MaxLength(254) email: string;
}

export class VerifyResetCodeDto implements VerifyResetCodeRequest {
  @IsString() @IsNotEmpty() @MaxLength(254) email: string;
  @IsString() @IsNotEmpty({ message: 'Escribe el código' }) @MaxLength(12) code: string;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString() @IsNotEmpty() @MaxLength(100) verificationToken: string;
  @IsString() @MaxLength(128) password: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) publicKey: string;
  @ValidateNested() @Type(() => KeyBackupDto) keyBackup: KeyBackupDto;
}

export class MatchContactsDto implements MatchContactsRequest {
  @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) @MaxLength(40, { each: true }) phones: string[];
}
