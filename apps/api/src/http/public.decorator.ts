import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marca una ruta como accesible sin sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
