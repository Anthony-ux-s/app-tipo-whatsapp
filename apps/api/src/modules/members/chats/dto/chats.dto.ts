import type {
  AddParticipantsRequest,
  CreateDirectConversationRequest,
  CreateGroupConversationRequest,
  CreateTaskRequest,
  TaskStatus,
  UpdateTaskRequest,
  EncryptedPayload,
  MediaAttachment,
  SendMessageRequest,
  WrappedKey,
} from '@parla/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class WrappedKeyDto implements WrappedKey {
  @IsString() @IsNotEmpty() userId: string;
  @IsString() @IsNotEmpty() @MaxLength(200) wrappedKey: string;
  @IsString() @IsNotEmpty() @MaxLength(40) iv: string;
  @IsString() @IsNotEmpty() wrappedById: string;
}

class EncryptedPayloadDto implements EncryptedPayload {
  @IsString() @IsNotEmpty() @MaxLength(40_000) ciphertext: string;
  @IsString() @IsNotEmpty() @MaxLength(40) iv: string;
}

class MediaAttachmentDto implements MediaAttachment {
  @IsString() @IsNotEmpty() @MaxLength(64) fileId: string;
  @IsString() @IsNotEmpty() @MaxLength(100) mimeType: string;
  @IsInt() @Min(1) size: number;
  @IsString() @IsNotEmpty() @MaxLength(40) iv: string;
  @IsOptional() @IsInt() @Min(0) @Max(3_600_000) durationMs?: number;
}

export class CreateDirectDto implements CreateDirectConversationRequest {
  @IsString() @IsNotEmpty() workspaceId: string;
  @IsString() @IsNotEmpty() userId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WrappedKeyDto) keys: WrappedKeyDto[];
}

export class CreateGroupDto implements CreateGroupConversationRequest {
  @IsString() @IsNotEmpty() workspaceId: string;
  @IsString() @MaxLength(60) title: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(255) @IsString({ each: true }) memberIds: string[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => WrappedKeyDto) keys: WrappedKeyDto[];
}

export class AddParticipantsDto implements AddParticipantsRequest {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(255) @IsString({ each: true }) userIds: string[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => WrappedKeyDto) keys: WrappedKeyDto[];
}

export class SendMessageDto implements SendMessageRequest {
  @IsString() @IsNotEmpty() @MaxLength(64) clientId: string;
  @IsIn(['text', 'image', 'audio', 'video']) kind: SendMessageRequest['kind'];
  @IsOptional() @ValidateNested() @Type(() => EncryptedPayloadDto) body: EncryptedPayloadDto | null;
  @IsOptional() @ValidateNested() @Type(() => MediaAttachmentDto) media: MediaAttachmentDto | null;
  @IsOptional() @IsString() @MaxLength(64) replyToId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(256) @IsString({ each: true }) mentions?: string[];
}

export class CreateTaskDto implements CreateTaskRequest {
  @IsString() @IsNotEmpty() @MaxLength(64) clientId: string;
  @ValidateNested() @Type(() => EncryptedPayloadDto) title: EncryptedPayloadDto;
  @IsOptional() @IsString() assigneeId: string | null;
  @IsOptional() @IsString() @MaxLength(10) dueDate: string | null;
  @IsOptional() @IsString() sourceMessageId: string | null;
}

export class UpdateTaskDto implements UpdateTaskRequest {
  @IsOptional() @IsIn(['open', 'done']) status?: TaskStatus;
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dueDate?: string | null;
}

export class MarkDeliveredDto {
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) messageIds: string[];
}
