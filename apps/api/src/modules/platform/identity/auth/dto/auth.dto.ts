import type { EncryptedKeyBackup, LoginRequest, RegisterRequest, ThemePreference, UpdateProfileRequest, UserPreferences } from '@parla/types';
import { Type } from 'class-transformer';
import {
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

class KeyBackupDto implements EncryptedKeyBackup {
  @IsString() @IsNotEmpty() @MaxLength(4000) ciphertext: string;
  @IsString() @IsNotEmpty() @MaxLength(64) iv: string;
  @IsString() @IsNotEmpty() @MaxLength(64) salt: string;
  @IsInt() @Min(1000) iterations: number;
}

export class RegisterDto implements RegisterRequest {
  @IsOptional() @IsString() @MaxLength(24) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) username?: string;
  @IsString() @MaxLength(60) displayName: string;
  @IsString() @MaxLength(128) password: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) publicKey: string;
  @ValidateNested() @Type(() => KeyBackupDto) keyBackup: KeyBackupDto;
}

export class LoginDto implements LoginRequest {
  @IsString() @IsNotEmpty({ message: 'Escribe tu usuario o teléfono' }) @MaxLength(30) identifier: string;
  @IsString() @IsNotEmpty({ message: 'Escribe tu contraseña' }) @MaxLength(128) password: string;
}

class PreferencesDto implements Partial<UserPreferences> {
  @IsOptional() @IsIn(['light', 'dark', 'system']) theme?: ThemePreference;
  @IsOptional() @IsBoolean() enterToSend?: boolean;
  @IsOptional() @IsBoolean() notificationSound?: boolean;
}

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional() @IsString() @MaxLength(60) displayName?: string;
  @IsOptional() @IsString() @MaxLength(140) about?: string;
  @IsOptional() @IsString() @MaxLength(20) avatarColor?: string;
  @IsOptional() @ValidateNested() @Type(() => PreferencesDto) preferences?: PreferencesDto;
}
