/** Errores de dominio neutros (sin Nest). El HttpExceptionFilter los traduce a HTTP. */
export abstract class DomainError extends Error {
  abstract readonly kind: 'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited';
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly kind = 'validation' as const;
}

export class UnauthorizedError extends DomainError {
  readonly kind = 'unauthorized' as const;
}

export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden' as const;
}

export class NotFoundError extends DomainError {
  readonly kind = 'not_found' as const;
}

export class ConflictError extends DomainError {
  readonly kind = 'conflict' as const;
}

/** Demasiados intentos seguidos: se pide esperar (HTTP 429). */
export class TooManyRequestsError extends DomainError {
  readonly kind = 'rate_limited' as const;
}
