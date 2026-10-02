-- ============================================================================
-- Migration 0014: Credential V2 Off-Chain & Multi-Evidence Architecture
-- CulturaGO Core Domain Schema
-- Idempotencia estricta: reejecutable N veces sin errores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIÓN IDEMPOTENTE DE TIPOS ENUMERADOS
-- ----------------------------------------------------------------------------

ALTER TYPE credential_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE relationship_kind ADD VALUE IF NOT EXISTS 'producer_of';

-- ----------------------------------------------------------------------------
-- 2. COLUMNAS ADITIVAS EN TABLA `credentials`
-- ----------------------------------------------------------------------------

-- schema_version es NULLABLE sin valor default para no etiquetar erróneamente
-- filas legacy que omitan el campo en inserciones futuras.
ALTER TABLE credentials
    ADD COLUMN IF NOT EXISTS public_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS credential_family VARCHAR(32),
    ADD COLUMN IF NOT EXISTS participation_mode VARCHAR(32),
    ADD COLUMN IF NOT EXISTS participation_id UUID REFERENCES participations(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS schema_version VARCHAR(32),
    ADD COLUMN IF NOT EXISTS display_label VARCHAR(64),
    ADD COLUMN IF NOT EXISTS display_subtitle VARCHAR(64),
    ADD COLUMN IF NOT EXISTS canonical_payload JSONB,
    ADD COLUMN IF NOT EXISTS payload_digest VARCHAR(64),
    ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;

-- Backfill de public_id estrictamente desde credential_code para filas V1 existentes
UPDATE credentials
SET public_id = credential_code
WHERE public_id IS NULL AND credential_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. FLEXIBILIZACIÓN DE REQUISITOS LEGACY ON-CHAIN (Idempotente)
-- ----------------------------------------------------------------------------

ALTER TABLE credentials
    ALTER COLUMN credential_type DROP NOT NULL,
    ALTER COLUMN issued_by DROP NOT NULL,
    ALTER COLUMN metadata_hash DROP NOT NULL,
    ALTER COLUMN hash_schema DROP NOT NULL,
    ALTER COLUMN credential_code DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. CHECK CONSTRAINTS COHERENTES CON IDEMPOTENCIA REAL (pg_constraint)
-- ----------------------------------------------------------------------------

-- 4.1 Coherencia de Versión (V1 vs V2 estrictamente disjuntos)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_credentials_version_coherence'
    ) THEN
        ALTER TABLE credentials
            ADD CONSTRAINT chk_credentials_version_coherence
            CHECK (
                -- Ramo Legacy V1:
                (
                    credential_family IS NULL
                    AND credential_type BETWEEN 1 AND 6
                    AND (schema_version IS NULL OR schema_version != 'culturago.credential.v2')
                )
                OR
                -- Ramo Credential V2:
                (
                    schema_version = 'culturago.credential.v2'
                    AND credential_family IN ('participant', 'guest', 'staff')
                    AND credential_type IS NULL
                )
            );
    END IF;
END $$;

-- 4.2 Coherencia V2: Familia, Modalidad y Presencia de Presentación
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_credentials_v2_family_mode'
    ) THEN
        ALTER TABLE credentials
            ADD CONSTRAINT chk_credentials_v2_family_mode
            CHECK (
                -- Fila legacy no evaluada:
                credential_family IS NULL
                OR
                -- Participante o Invitada: requiere modalidad escénica y participación vinculada
                (
                    credential_family IN ('participant', 'guest')
                    AND participation_mode IN ('solo', 'group')
                    AND participation_id IS NOT NULL
                )
                OR
                -- Staff: modalidad no aplicable y sin presentación escénica
                (
                    credential_family = 'staff'
                    AND participation_mode = 'not_applicable'
                    AND participation_id IS NULL
                )
            );
    END IF;
END $$;

-- 4.3 Formato Hexadecimal de payload_digest (SHA-256)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_credentials_payload_digest'
    ) THEN
        ALTER TABLE credentials
            ADD CONSTRAINT chk_credentials_payload_digest
            CHECK (payload_digest IS NULL OR payload_digest ~ '^[0-9a-f]{64}$');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. TABLA DE EVIDENCIAS: `credential_evidence`
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credential_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
    source_type VARCHAR(32) NOT NULL CHECK (source_type IN ('participation', 'relationship')),
    source_id UUID NOT NULL,
    evidence_role VARCHAR(64) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Protege contra duplicar la misma evidencia dentro de una misma credencial
    CONSTRAINT uq_credential_evidence_item UNIQUE (credential_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_credential_evidence_credential_id
    ON credential_evidence (credential_id);

CREATE INDEX IF NOT EXISTS idx_credential_evidence_source
    ON credential_evidence (source_type, source_id);

-- ----------------------------------------------------------------------------
-- 6. UNICIDAD E IDEMPOTENCIA V2: CREDENCIALES NO REVOCADAS EQUIVALENTES
-- ----------------------------------------------------------------------------

-- Índice único en public_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_credentials_public_id
    ON credentials (public_id);

-- PARTICIPANT / GUEST:
-- Solo puede existir una credencial V2 no revocada (draft o issued) por
-- cada presentación (participation_id) de un sujeto en un evento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_credentials_participant_guest_non_revoked
    ON credentials (subject_entity_id, event_id, credential_family, participation_id)
    WHERE credential_family IN ('participant', 'guest') AND status != 'revoked';

-- STAFF:
-- Solo puede existir una credencial V2 de staff no revocada (draft o issued)
-- por sujeto en un evento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_credentials_staff_non_revoked
    ON credentials (subject_entity_id, event_id)
    WHERE credential_family = 'staff' AND status != 'revoked';

-- Búsqueda eficiente por evento y familia
CREATE INDEX IF NOT EXISTS idx_credentials_event_family
    ON credentials (event_id, credential_family);
