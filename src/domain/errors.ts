export type DomainErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'ALREADY_EXISTS'
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'VERSION_CONFLICT'
  | 'ALREADY_REVOKED'
  | 'INVALID_STATE_TRANSITION'
  | 'PARTICIPATION_NOT_CONFIRMED'
  | 'ISSUER_OPERATOR_NOT_LINKED'
  | 'UNKNOWN_CREDENTIAL_TYPE'
  | 'INVALID_RELATIONSHIP'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function domainError(code: DomainErrorCode, message: string): DomainError {
  return new DomainError(code, message);
}

export function isDomainError(error: unknown, code?: DomainErrorCode): error is DomainError {
  return (
    error instanceof DomainError && (code === undefined || error.code === code)
  );
}
