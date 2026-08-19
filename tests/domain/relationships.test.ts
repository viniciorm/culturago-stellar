import { describe, expect, it } from 'vitest';
import {
  createsCycle,
  RelationshipInput,
  validateRelationship,
} from '@/domain/participation/relationships';

const rel = (overrides: Partial<RelationshipInput>): RelationshipInput => ({
  type: 'participant_of',
  fromEntityId: 'person-1',
  fromKind: 'person',
  toEntityId: 'event-1',
  toKind: 'event',
  contextEventId: 'event-1',
  ...overrides,
});

describe('relationship validation matrix', () => {
  it('accepts a person participating in an event with matching context', () => {
    expect(() => validateRelationship(rel({}))).not.toThrow();
  });

  it('rejects self-relationships', () => {
    expect(() => validateRelationship(rel({ toEntityId: 'person-1' }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_RELATIONSHIP' })
    );
  });

  it('rejects invalid origin kinds', () => {
    expect(() =>
      validateRelationship(rel({ type: 'member_of', fromKind: 'provider', toKind: 'organization', contextEventId: null }))
    ).toThrowError(expect.objectContaining({ code: 'INVALID_RELATIONSHIP' }));
  });

  it('rejects invalid target kinds', () => {
    expect(() =>
      validateRelationship(rel({ type: 'organizer_of', fromKind: 'organization', toKind: 'person', contextEventId: null }))
    ).toThrowError(expect.objectContaining({ code: 'INVALID_RELATIONSHIP' }));
  });

  it('participant_of requires an event context matching the target', () => {
    expect(() => validateRelationship(rel({ contextEventId: null }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_RELATIONSHIP' })
    );
    expect(() => validateRelationship(rel({ contextEventId: 'other-event' }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_RELATIONSHIP' })
    );
  });

  it('accepts provider coverage of an event', () => {
    expect(() =>
      validateRelationship(
        rel({ type: 'official_photographer_of', fromKind: 'provider', contextEventId: null })
      )
    ).not.toThrow();
  });

  it('rejects unknown relationship types', () => {
    expect(() =>
      validateRelationship(rel({ type: 'best_friend_of' as never }))
    ).toThrowError(expect.objectContaining({ code: 'INVALID_RELATIONSHIP' }));
  });
});

describe('cycle detection for hierarchical links', () => {
  const edges = [
    ['org-a', 'org-b'],
    ['org-b', 'org-c'],
  ] as const;

  it('detects a direct and indirect cycle', () => {
    expect(createsCycle('member_of', 'org-c', 'org-a', edges)).toBe(true);
    expect(createsCycle('director_of', 'org-c', 'org-b', edges)).toBe(true);
  });

  it('allows acyclic links', () => {
    expect(createsCycle('member_of', 'org-d', 'org-a', edges)).toBe(false);
  });

  it('ignores non-hierarchical types', () => {
    expect(createsCycle('sponsor_of', 'org-c', 'org-a', edges)).toBe(false);
  });
});
