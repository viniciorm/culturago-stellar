-- 0005_credential_title_description.sql — Agrega campos de presentación al dashboard
-- de credenciales. El hash on-chain sigue siendo la fuente de verdad.

ALTER TABLE credentials
    ADD COLUMN title TEXT NOT NULL DEFAULT '',
    ADD COLUMN description TEXT;
