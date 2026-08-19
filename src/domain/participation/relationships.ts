import { domainError } from '../errors';

export type DomainEntityKind = 'person' | 'organization' | 'provider' | 'event';

export type RelationshipType =
  | 'organizer_of'
  | 'participant_of'
  | 'member_of'
  | 'teacher_at'
  | 'director_of'
  | 'founder_of'
  | 'provider_of'
  | 'venue_of'
  | 'sponsor_of'
  | 'official_photographer_of'
  | 'official_videographer_of'
  | 'technical_partner_of'
  | 'food_partner_of'
  | 'media_partner_of';

interface RelationshipRule {
  from: readonly DomainEntityKind[];
  to: readonly DomainEntityKind[];
  requiresEventContext: boolean;
}

const PERSON_TO_ORG = ['member_of', 'teacher_at', 'director_of', 'founder_of'] as const;

/**
 * Validation matrix: which relationship types are allowed between which
 * entity kinds, and whether a concrete event context is mandatory.
 */
export const RELATIONSHIP_RULES: Readonly<Record<RelationshipType, RelationshipRule>> = {
  organizer_of: { from: ['organization'], to: ['event'], requiresEventContext: false },
  participant_of: { from: ['person', 'organization'], to: ['event'], requiresEventContext: true },
  member_of: { from: ['person'], to: ['organization'], requiresEventContext: false },
  teacher_at: { from: ['person'], to: ['organization'], requiresEventContext: false },
  director_of: { from: ['person'], to: ['organization'], requiresEventContext: false },
  founder_of: { from: ['person'], to: ['organization'], requiresEventContext: false },
  provider_of: { from: ['provider', 'organization'], to: ['event', 'organization'], requiresEventContext: false },
  venue_of: { from: ['provider'], to: ['event'], requiresEventContext: false },
  sponsor_of: { from: ['provider', 'organization'], to: ['event'], requiresEventContext: false },
  official_photographer_of: { from: ['provider', 'person'], to: ['event'], requiresEventContext: false },
  official_videographer_of: { from: ['provider', 'person'], to: ['event'], requiresEventContext: false },
  technical_partner_of: { from: ['provider', 'organization'], to: ['event'], requiresEventContext: false },
  food_partner_of: { from: ['provider'], to: ['event'], requiresEventContext: false },
  media_partner_of: { from: ['provider', 'organization'], to: ['event'], requiresEventContext: false },
};

/** Types that create hierarchical links where cycles are forbidden. */
const CYCLICAL_TYPES: readonly RelationshipType[] = [...PERSON_TO_ORG];

export interface RelationshipInput {
  type: RelationshipType;
  fromEntityId: string;
  fromKind: DomainEntityKind;
  toEntityId: string;
  toKind: DomainEntityKind;
  contextEventId: string | null;
}

export function validateRelationship(input: RelationshipInput): void {
  const rule = RELATIONSHIP_RULES[input.type];
  if (!rule) {
    throw domainError('INVALID_RELATIONSHIP', `Unknown relationship type: ${input.type}`);
  }
  if (input.fromEntityId === input.toEntityId) {
    throw domainError('INVALID_RELATIONSHIP', 'An entity cannot relate to itself');
  }
  if (!rule.from.includes(input.fromKind)) {
    throw domainError(
      'INVALID_RELATIONSHIP',
      `${input.type} cannot originate from a ${input.fromKind}`
    );
  }
  if (!rule.to.includes(input.toKind)) {
    throw domainError(
      'INVALID_RELATIONSHIP',
      `${input.type} cannot target a ${input.toKind}`
    );
  }
  if (rule.requiresEventContext && !input.contextEventId) {
    throw domainError(
      'INVALID_RELATIONSHIP',
      `${input.type} requires a concrete event context`
    );
  }
  if (input.type === 'participant_of' && input.contextEventId && input.toKind === 'event') {
    if (input.contextEventId !== input.toEntityId) {
      throw domainError(
        'INVALID_RELATIONSHIP',
        'participant_of context must match the target event'
      );
    }
  }
}

/**
 * Cycle check for hierarchical types (membership/teaching/direction).
 * `edges` contains existing [fromId, toId] pairs of the same type family.
 */
export function createsCycle(
  type: RelationshipType,
  fromEntityId: string,
  toEntityId: string,
  edges: readonly (readonly [string, string])[]
): boolean {
  if (!CYCLICAL_TYPES.includes(type)) return false;
  const adjacency = new Map<string, string[]>();
  for (const [from, to] of edges) {
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  }
  const stack = [toEntityId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromEntityId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}
