import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody } from '@parla/types';
import type { Response } from 'express';
import { DomainError } from '../../kernel/domain-error';

const STATUS_BY_KIND: Record<DomainError['kind'], number> = {
  validation: HttpStatus.BAD_REQUEST,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
};

/** Traduce DomainError y HttpException a una respuesta JSON uniforme (ApiErrorBody). */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof DomainError) {
      const statusCode = STATUS_BY_KIND[exception.kind];
      return { statusCode, error: exception.kind, message: exception.message };
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse() as string | { message?: string | string[] };
      const raw = typeof res === 'string' ? res : res.message;
      const message = Array.isArray(raw) ? raw[0] : (raw ?? exception.message);
      return { statusCode, error: HttpStatus[statusCode]?.toLowerCase() ?? 'error', message };
    }
    this.logger.error(exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'internal',
      message: 'Algo salió mal. Inténtalo de nuevo en un momento.',
    };
  }
}
