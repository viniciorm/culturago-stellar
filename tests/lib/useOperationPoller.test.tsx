// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOperationPoller } from '@/lib/hooks/useOperationPoller';
import type { OperationState } from '@/ports/StellarGateway';

describe('useOperationPoller', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  function pendingOperation(overrides?: Partial<OperationState>): OperationState {
    return {
      operationId: 'op-1',
      idempotencyKey: 'idem-1',
      phase: 'submitted',
      txHash: '0xabc',
      ledger: 1000,
      errorCode: null,
      ...overrides,
    };
  }

  it('calls onUpdate and stops polling when the operation becomes terminal', async () => {
    const onUpdate = vi.fn();
    const initial = pendingOperation({ phase: 'submitted' });
    const terminal = pendingOperation({ phase: 'confirmed' });

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ operation: terminal }), { status: 200 })
    );

    renderHook(({ operation }) => useOperationPoller(operation, onUpdate), {
      initialProps: { operation: initial },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(terminal));
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff on non-ok responses', async () => {
    const onUpdate = vi.fn();
    const operation = pendingOperation({ phase: 'submitted' });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ operation: pendingOperation({ phase: 'confirmed' }) }), { status: 200 })
      );

    renderHook(({ op }) => useOperationPoller(op, onUpdate), {
      initialProps: { op: operation },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('does not call onUpdate when the operation is already terminal', async () => {
    const onUpdate = vi.fn();
    const operation = pendingOperation({ phase: 'confirmed' });

    renderHook(({ op }) => useOperationPoller(op, onUpdate), {
      initialProps: { op: operation },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
