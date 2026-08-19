import { OperationPhase } from '../../ports/StellarGateway';
import { domainError } from '../errors';

/**
 * Legal phase transitions for a chain operation. `unknown` and `restoring`
 * are reconcilable states: they may recover to a real phase or degrade to a
 * terminal failure, but never jump straight to `confirmed` without evidence.
 */
const TRANSITIONS: Readonly<Record<OperationPhase, readonly OperationPhase[]>> = {
  awaiting_signature: ['signed', 'failed_terminal'],
  signed: ['submitted', 'failed_retryable'],
  submitted: ['confirming', 'failed_retryable', 'unknown'],
  confirming: ['confirmed', 'failed_retryable', 'failed_terminal', 'unknown', 'restoring'],
  confirmed: [],
  failed_retryable: ['awaiting_signature', 'submitted', 'unknown', 'failed_terminal'],
  failed_terminal: [],
  unknown: ['submitted', 'confirming', 'confirmed', 'failed_retryable', 'failed_terminal', 'restoring'],
  restoring: ['awaiting_signature', 'submitted', 'failed_retryable', 'failed_terminal'],
};

export function canTransition(from: OperationPhase, to: OperationPhase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OperationPhase, to: OperationPhase): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw domainError(
      'INVALID_STATE_TRANSITION',
      `Operation cannot move from ${from} to ${to}`
    );
  }
}

/** Terminal phases never move again and are never retried blindly. */
export function isTerminal(phase: OperationPhase): boolean {
  return phase === 'confirmed' || phase === 'failed_terminal';
}

/** Phases where a re-submission would risk duplication on-chain. */
export function mustNotResubmit(phase: OperationPhase): boolean {
  return (
    phase === 'submitted' ||
    phase === 'confirming' ||
    phase === 'unknown' ||
    phase === 'restoring' ||
    isTerminal(phase)
  );
}
