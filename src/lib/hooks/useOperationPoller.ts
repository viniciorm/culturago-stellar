'use client';

import { useEffect, useRef } from 'react';
import type { OperationState } from '@/ports/StellarGateway';

const TERMINAL_PHASES = new Set(['confirmed', 'failed_terminal']);
const POLL_INTERVAL_MS = 3000;

/**
 * Polls the scoped operation endpoint until the operation reaches a terminal
 * phase. Calls `onUpdate` on every successful poll.
 */
export function useOperationPoller(
  operation: OperationState | null,
  onUpdate: (state: OperationState) => void
) {
  const operationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!operation) {
      operationIdRef.current = null;
      return;
    }

    if (TERMINAL_PHASES.has(operation.phase)) {
      operationIdRef.current = null;
      return;
    }

    operationIdRef.current = operation.operationId;
    const id = operation.operationId;

    const poll = async () => {
      try {
        const res = await fetch(`/api/operations/${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { operation?: OperationState };
        if (body.operation) {
          onUpdate(body.operation);
        }
      } catch {
        // Polling errors are swallowed; the next tick retries.
      }
    };

    // Poll immediately, then every N seconds.
    const initialTimer = setTimeout(poll, 0);
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [operation, onUpdate]);
}
