import { Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { MAX_PHOTO_BYTES, UploadPhotoUseCase } from '../../platform/services/use-cases/photos.use-cases';

/** Subir una foto privada (documento del repartidor, foto de entrega o de un reclamo) para adjuntarla. */
@Controller('photos')
export class PhotosController {
  constructor(private readonly upload: UploadPhotoUseCase) {}

  @HttpCode(201)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  create(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined): Promise<{ photoId: string }> {
    return this.upload.execute(user.userId, file?.buffer);
  }
}
