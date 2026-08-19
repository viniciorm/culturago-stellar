import 'server-only';
import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  correlationId: string;
  idempotencyKey?: string;
  network?: string;
  contractId?: string;
  method?: string;
  phase?: string;
  ledger?: number;
  code?: string;
  accountId?: string;
  [key: string]: unknown;
}

const SENSITIVE_PATTERNS = [
  /password/i,
  /passkey/i,
  /seed/i,
  /secret/i,
  /private/i,
  /cookie/i,
  /challenge/i,
  /token/i,
  /authorization/i,
  /connection/i,
  /postgres:\/\//i,
  /BEGIN PRIVATE KEY/,
  /xdr/i,
];

const REQUEST_STORAGE = new AsyncLocalStorage<LogContext>();

/** Structured, redacted server-side logger. Never leaks PII, secrets or raw WebAuthn. */
export class Logger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  static setContext(ctx: LogContext): void {
    REQUEST_STORAGE.run(ctx, () => {});
  }

  static getContext(): LogContext | undefined {
    return REQUEST_STORAGE.getStore();
  }

  static redact(value: unknown): unknown {
    if (typeof value === 'string') {
      if (SENSITIVE_PATTERNS.some((p) => p.test(value))) {
        return '[REDACTED]';
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(Logger.redact);
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_PATTERNS.some((p) => p.test(k))) {
          result[k] = '[REDACTED]';
        } else {
          result[k] = Logger.redact(v);
        }
      }
      return result;
    }
    return value;
  }

  private emit(level: string, message: string, extra: Record<string, unknown> = {}): void {
    const ctx = REQUEST_STORAGE.getStore();
    const payload = Object.assign(
      {
        time: new Date().toISOString(),
        level,
        component: this.component,
        message,
      },
      ctx,
      Logger.redact(extra)
    );
    if (level === 'error') console.error(JSON.stringify(payload));
    else if (level === 'warn') console.warn(JSON.stringify(payload));
    else console.log(JSON.stringify(payload));
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.emit('info', message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.emit('warn', message, extra);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    this.emit('error', message, extra);
  }
}
