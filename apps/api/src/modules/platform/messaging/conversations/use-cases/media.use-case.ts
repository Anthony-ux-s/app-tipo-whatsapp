import { Inject, Injectable } from '@nestjs/common';
import type { UploadedFile } from '@parla/types';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { FILE_STORAGE, type FileStorage } from '../../../../../infra/storage/file-storage.port';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { GetConversationUseCase } from './get-conversation.use-case';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Sube un archivo ya cifrado en el navegador; el servidor no puede ver su contenido. */
@Injectable()
export class UploadMediaUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly getConversation: GetConversationUseCase,
  ) {}

  async execute(userId: string, conversationId: string, data: Buffer | undefined): Promise<UploadedFile> {
    await this.getConversation.require(conversationId, userId);
    if (!data || data.length === 0) throw new ValidationError('El archivo está vacío');
    if (data.length > MAX_UPLOAD_BYTES) throw new ValidationError('El archivo supera los 25 MB');
    const fileId = randomBytes(16).toString('hex');
    await this.storage.save(fileId, data);
    await this.conversations.registerFile({ id: fileId, conversationId, uploaderId: userId, size: data.length });
    return { fileId, size: data.length };
  }
}

@Injectable()
export class DownloadMediaUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async execute(userId: string, fileId: string): Promise<Readable> {
    const file = await this.conversations.findFile(fileId);
    const allowed = file && (await this.conversations.findForUser(file.conversationId, userId));
    if (!allowed || !(await this.storage.exists(fileId))) throw new NotFoundError('Archivo no encontrado');
    return this.storage.read(fileId);
  }
}
