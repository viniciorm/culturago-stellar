'use client';

import { useEffect, useRef } from 'react';
import type { OperationState } from '@/ports/StellarGateway';

const TERMINAL_PHASES = new Set(['confirmed', 'failed_terminal']);
const MAX_ATTEMPTS = 60;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

function nextBackoffMs(attempt: number): number {
  return Math.min(INITIAL_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

/**
 * Polls the scoped operation endpoint until the operation reaches a terminal
 * phase or the maximum number of attempts is exceeded.
 *
 * - Uses an AbortController to cancel in-flight requests on cleanup/unmount.
 * - Exponential backoff with a cap, both on errors and non-terminal updates.
 * - Aborts immediately when the operation becomes terminal.
 */
export function useOperationPoller(
  operation: OperationState | null,
  onUpdate: (state: OperationState) => void
) {
  const operationIdRef = useRef<string | null>(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    if (!operation) {
      operationIdRef.current = null;
      return;
    }

    if (TERMINAL_PHASES.has(operation.phase)) {
      operationIdRef.current = null;
      return;
    }

    const id = operation.operationId;
    operationIdRef.current = id;

    const abortController = new AbortController();
    let attempt = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (abortController.signal.aborted) return;
      timeoutId = setTimeout(poll, delay);
    };

    const poll = async () => {
      if (operationIdRef.current !== id || abortController.signal.aborted) return;

      attempt += 1;
      if (attempt > MAX_ATTEMPTS) {
        operationIdRef.current = null;
        return;
      }

      try {
        const res = await fetch(`/api/operations/${encodeURIComponent(id)}`, {
          signal: abortController.signal,
        });
        if (!res.ok) {
          schedule(nextBackoffMs(attempt));
          return;
        }
        const body = (await res.json()) as { operation?: OperationState };
        if (body.operation) {
          onUpdateRef.current(body.operation);
          if (TERMINAL_PHASES.has(body.operation.phase)) {
            operationIdRef.current = null;
            return;
          }
        }
        schedule(nextBackoffMs(attempt));
      } catch {
        // Ignore abort errors and aborted schedules.
        if (!abortController.signal.aborted) {
          schedule(nextBackoffMs(attempt));
        }
      }
    };

    schedule(0);

    return () => {
      operationIdRef.current = null;
      abortController.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [operation]);
}
