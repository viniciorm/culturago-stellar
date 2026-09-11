#!/usr/bin/env node
/**
 * scripts/import-fdvc2026-pilot.mjs
 *
 * Importador idempotente del Piloto FDVC 2026 para CulturaGO.
 * Soporta archivos de Presentaciones Artísticas y de Roles Oficiales / Staff.
 *
 * Uso:
 *   Dry-run Presentaciones Artísticas:
 *     node scripts/import-fdvc2026-pilot.mjs --file data/fdvc2026_presentaciones.example.csv
 *
 *   Dry-run Roles Oficiales / Staff:
 *     node scripts/import-fdvc2026-pilot.mjs --file data/fdvc2026_staff_claims.example.csv
 *
 *   Aplicación real en PostgreSQL:
 *     node scripts/import-fdvc2026-pilot.mjs --file data/fdvc2026_staff_claims.csv --apply
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

// ---------- Helper Utilities ----------

function parseArgs() {
  const args = process.argv.slice(2);
  let file = 'data/fdvc2026_presentaciones.example.csv';
  let apply = false;
  let manifestOutput = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      file = args[i + 1];
      i++;
    } else if (args[i] === '--apply') {
      apply = true;
    } else if (args[i] === '--output-manifest' && args[i + 1]) {
      manifestOutput = args[i + 1];
      i++;
    }
  }

  const resolvedFile = resolve(file);
  if (!manifestOutput) {
    manifestOutput = resolvedFile.includes('staff')
      ? 'data/fdvc2026_staff_claims_manifest.json'
      : 'data/fdvc2026_claims_manifest.json';
  }

  return { file: resolvedFile, apply, manifestOutput: resolve(manifestOutput) };
}

function parseCSV(content) {
  const lines = [];
  let field = '';
  let inQuotes = false;
  let currentRecord = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRecord.push(field.trim());
      field = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRecord.push(field.trim());
      if (currentRecord.some((f) => f.length > 0)) {
        lines.push(currentRecord);
      }
      currentRecord = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || currentRecord.length > 0) {
    currentRecord.push(field.trim());
    if (currentRecord.some((f) => f.length > 0)) {
      lines.push(currentRecord);
    }
  }

  if (lines.length === 0) return [];
  const headers = lines[0].map((h) => h.toLowerCase().trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const row = {};
    headers.forEach((h, index) => {
      row[h] = lines[i][index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function generateDeterministicClaimCode(prefix, num, email) {
  const seed = `${prefix}:${num}:${email.toLowerCase().trim()}`;
  const hash = createHash('sha256').update(seed).digest('hex').toUpperCase();
  return `${prefix}-${hash.slice(0, 6)}`;
}

function generateCredentialCode(prefix, num) {
  return `${prefix}-${String(num).padStart(3, '0')}`;
}

function loadEnvFile() {
  const envPath = resolve('/opt/culturago/.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      if (line.includes('=') && !line.trim().startsWith('#')) {
        const [k, v] = line.split('=', 2);
        const key = k.trim();
        const val = v.trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// ---------- Main Execution Flow ----------

async function main() {
  const { file, apply, manifestOutput } = parseArgs();
  console.log('\n==================================================');
  console.log('  🎉 CulturaGO - Importador Piloto FDVC 2026');
  console.log('==================================================');
  console.log(`  Modo        : ${apply ? '🚀 APLICAR EN BD (--apply)' : '🔍 DRY-RUN (Solo validación)'}`);
  console.log(`  Archivo CSV : ${file}`);

  if (!existsSync(file)) {
    console.error(`\n❌ Error: El archivo CSV no existe en "${file}"`);
    process.exit(1);
  }

  const csvContent = readFileSync(file, 'utf8');
  const rows = parseCSV(csvContent);

  if (rows.length === 0) {
    console.error('\n❌ Error: El archivo CSV está vacío o no tiene el formato esperado.');
    process.exit(1);
  }

  const isStaffMode = rows.length > 0 && ('rol_oficial' in rows[0] || 'id_staff' in rows[0]);
  console.log(`  Tipo CSV    : ${isStaffMode ? '👥 ROLES OFICIALES / STAFF' : '🎭 PRESENTACIONES ARTÍSTICAS'}`);
  console.log(`  Filas CSV   : ${rows.length} registros encontrados\n`);

  const solistas = [];
  const grupales = [];
  const schoolsMap = new Map();
  const peopleMap = new Map();
  const manifest = [];
  const warnings = [];

  if (isStaffMode) {
    // Mode: Staff Claims
    rows.forEach((r, idx) => {
      const num = r.id_staff || String(idx + 1);
      const nombre = (r.nombre_completo || '').trim();
      const email = (r.email_contacto || '').toLowerCase().trim();
      const phone = (r.telefono_contacto || '').trim();
      const rol = (r.rol_oficial || 'Staff Oficial').trim();
      const titulo = (r.titulo_credencial || 'Certificado de Rol Oficial FDVC 2026').trim();
      const descripcion = (r.descripcion_credencial || `Reconocimiento de Rol Oficial — ${rol}`).trim();

      if (!email) warnings.push(`Fila #${num} (${nombre}): No contiene email de contacto.`);
      if (!nombre) warnings.push(`Fila #${num}: No contiene nombre completo.`);

      const claimCode = generateDeterministicClaimCode('FDVC2026-STAFF', num, email || `staff-${num}`);
      const credentialCode = generateCredentialCode('FDVC2026-STAFF-CRED', num);

      const slug = slugify(nombre);
      peopleMap.set(email || `staff-${num}`, { name: nombre, email, phone, slug, rol });

      manifest.push({
        id_staff: num,
        nombre_completo: nombre,
        email_contacto: email,
        telefono_contacto: phone,
        rol_oficial: rol,
        titulo_credencial: titulo,
        descripcion_credencial: descripcion,
        claim_code: claimCode,
        credential_code: credentialCode,
      });
    });
  } else {
    // Mode: Artistic Presentations
    rows.forEach((r, idx) => {
      const num = r.numero_presentacion || String(idx + 1);
      const baile = r.nombre_baile || 'Sin nombre';
      const tipo = (r.tipo_participacion || '').toLowerCase();
      const escuela = (r.nombre_escuela || '').trim();
      const encargada = (r.nombre_encargada || '').trim();
      const email = (r.email_contacto || '').toLowerCase().trim();
      const phone = (r.telefono_contacto || '').trim();
      const isSolista = tipo.includes('solista');

      if (!email) warnings.push(`Fila #${num} (${baile}): No contiene email de contacto.`);
      if (!encargada) warnings.push(`Fila #${num} (${baile}): No contiene nombre de encargada/solista.`);

      const claimCode = generateDeterministicClaimCode('FDVC2026-CLAIM', num, email || `user-${num}`);
      const credentialCode = generateCredentialCode('FDVC2026-CRED', num);

      const item = {
        num,
        baile,
        tipo: r.tipo_participacion,
        escuela,
        encargada,
        email,
        phone,
        isSolista,
        claimCode,
        credentialCode,
        titulo: 'Certificado de Participación FDVC 2026',
        descripcion: isSolista
          ? `Acreditación Oficial de Participación Solista (${baile}) — FDVC 2026`
          : `Acreditación Oficial de Participación Grupal (${baile} - ${escuela}) — FDVC 2026`,
      };

      if (isSolista) {
        solistas.push(item);
      } else {
        grupales.push(item);
        if (escuela) {
          const slug = slugify(escuela);
          if (!schoolsMap.has(slug)) {
            schoolsMap.set(slug, { name: escuela, slug, contactEmail: email, contactPhone: phone });
          }
        }
      }

      if (email) {
        const slug = slugify(encargada);
        if (!peopleMap.has(email)) {
          peopleMap.set(email, { name: encargada, email, phone, slug, isSolista });
        }
      }

      manifest.push({
        numero_presentacion: num,
        nombre_baile: baile,
        tipo_participacion: r.tipo_participacion,
        nombre_escuela: escuela || 'N/A (Solista)',
        nombre_encargada: encargada,
        email_contacto: email,
        titulo_credencial: item.titulo,
        descripcion_credencial: item.descripcion,
        claim_code: claimCode,
        credential_code: credentialCode,
      });
    });
  }

  // Display Dry-Run Report Summary
  console.log('--------------------------------------------------');
  console.log('  📊 RESUMEN DE DIAGNÓSTICO (DRY-RUN)');
  console.log('--------------------------------------------------');
  if (isStaffMode) {
    console.log(`  • Cuentas de Staff / Oficiales : ${peopleMap.size}`);
    console.log(`  • Credenciales de Rol a emitir: ${manifest.length}`);
    console.log(`  • Challenges Claim a crear    : ${manifest.length}`);
  } else {
    console.log(`  • Presentaciones Solistas  : ${solistas.length}`);
    console.log(`  • Presentaciones Grupales  : ${grupales.length}`);
    console.log(`  • Escuelas / Orgs a crear : ${schoolsMap.size}`);
    console.log(`  • Personas / Cuentas a crear: ${peopleMap.size}`);
    console.log(`  • Credenciales a emitir    : ${rows.length}`);
    console.log(`  • Challenges Claim a crear : ${peopleMap.size}`);
  }

  if (warnings.length > 0) {
    console.log('\n  ⚠️ ADVERTENCIAS:');
    warnings.forEach((w) => console.log(`     - ${w}`));
  }

  if (!apply) {
    console.log('\n--------------------------------------------------');
    console.log('  💡 Para ejecutar la inserción real en PostgreSQL:');
    console.log(`     node scripts/import-fdvc2026-pilot.mjs --file ${file} --apply`);
    console.log('--------------------------------------------------\n');
    return;
  }

  // ---------- Execution Mode (--apply) ----------

  loadEnvFile();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('\n❌ Error: DATABASE_URL no encontrada en el entorno ni en /opt/culturago/.env');
    process.exit(1);
  }

  console.log('\n--------------------------------------------------');
  console.log('  ⚙️ CONECTANDO A POSTGRESQL Y APLICANDO...');
  console.log('--------------------------------------------------');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Asegurar Organización Festival
    const fdvcOrgSlug = 'festival-nacional-danza-vientre-chile';
    let resOrg = await client.query('SELECT id FROM entities WHERE slug = $1', [fdvcOrgSlug]);
    let fdvcOrgEntityId;

    if (resOrg.rows.length === 0) {
      const res = await client.query(
        `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
         VALUES ('organization', 'Festival Nacional Danza del Vientre Chile', $1, 'Chile', 'Santiago', 'verified', true, true)
         RETURNING id`,
        [fdvcOrgSlug]
      );
      fdvcOrgEntityId = res.rows[0].id;
      await client.query(
        `INSERT INTO organizations (entity_id, organization_type, contact_name, contact_email)
         VALUES ($1, 'festival', 'FDVC', 'contacto@culturago.cl')`,
        [fdvcOrgEntityId]
      );
      console.log('  ✅ Creada organización emisora FDVC');
    } else {
      fdvcOrgEntityId = resOrg.rows[0].id;
      console.log('  ℹ️ Organización emisora FDVC existente');
    }

    // 2. Asegurar Evento FDVC 2026
    const eventSlug = 'fdvc-2026';
    let resEv = await client.query('SELECT id FROM entities WHERE slug = $1', [eventSlug]);
    let eventEntityId;

    if (resEv.rows.length === 0) {
      const res = await client.query(
        `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
         VALUES ('event', 'Festival Nacional Danza del Vientre Chile 2026', $1, 'Chile', 'Santiago', 'verified', true, true)
         RETURNING id`,
        [eventSlug]
      );
      eventEntityId = res.rows[0].id;
      await client.query(
        `INSERT INTO events (entity_id, name, year, start_date, location, organizer_entity_id)
         VALUES ($1, 'Festival Nacional Danza del Vientre Chile 2026', 2026, '2026-09-01', 'Santiago, Chile', $2)`,
        [eventEntityId, fdvcOrgEntityId]
      );
      console.log('  ✅ Creado evento FDVC 2026');
    } else {
      eventEntityId = resEv.rows[0].id;
      console.log('  ℹ️ Evento FDVC 2026 existente');
    }

    // 3. Admin Account id for issued_by
    const resAdmin = await client.query('SELECT id FROM accounts LIMIT 1');
    const adminAccountId = resAdmin.rows[0]?.id || 'b2c3d4e5-f6a7-8901-bcde-222222222222';

    let countCreds = 0;
    let countAccounts = 0;

    if (isStaffMode) {
      // Process Staff Rows
      for (const item of manifest) {
        const email = item.email_contacto;
        const personSlug = slugify(item.nombre_completo || `staff-${item.id_staff}`);

        let personEntityId;
        let existingPerson = await client.query(
          `SELECT entity_id FROM people WHERE email = $1 LIMIT 1`,
          [email]
        );

        if (existingPerson.rows.length > 0) {
          personEntityId = existingPerson.rows[0].entity_id;
        } else {
          const pEnt = await client.query(
            `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
             VALUES ('person', $1, $2, 'Chile', 'Santiago', 'verified', true, true)
             RETURNING id`,
            [item.nombre_completo, personSlug]
          );
          personEntityId = pEnt.rows[0].id;
          await client.query(
            `INSERT INTO people (entity_id, artistic_name, email, main_role)
             VALUES ($1, $2, $3, 'staff')`,
            [personEntityId, item.nombre_completo, email]
          );
        }

        // Relación -> Evento (organizer_of / staff)
        await client.query(
          `INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status, notes)
           VALUES ($1, $2, 'organizer_of', $2, 'active', $3)
           ON CONFLICT DO NOTHING`,
          [personEntityId, eventEntityId, `Rol Oficial: ${item.rol_oficial}`]
        );

        // Participación
        await client.query(
          `INSERT INTO participations (subject_entity_id, event_id, state)
           VALUES ($1, $2, 'registered')
           ON CONFLICT (subject_entity_id, event_id) DO NOTHING`,
          [personEntityId, eventEntityId]
        );

        // Credencial (type 3 = teacher_director / staff)
        const metadataHash = sha256Hex(`FDVC2026:STAFF:${item.id_staff}:${item.nombre_completo}`);
        await client.query(
          `INSERT INTO credentials (credential_code, issuer_entity_id, issued_by, subject_entity_id, event_id, credential_type, metadata_hash, hash_schema, status, title, description)
           VALUES ($1, $2, $3, $4, $5, 3, $6, 1, 'issued', $7, $8)
           ON CONFLICT (issuer_entity_id, subject_entity_id, event_id, credential_type) DO NOTHING`,
          [item.credential_code, fdvcOrgEntityId, adminAccountId, personEntityId, eventEntityId, metadataHash, item.titulo_credencial, item.descripcion_credencial]
        );
        countCreds++;

        // Account
        let resAcc = await client.query('SELECT id FROM accounts WHERE person_entity_id = $1', [personEntityId]);
        let accountId;
        if (resAcc.rows.length === 0) {
          const insAcc = await client.query(
            `INSERT INTO accounts (status, person_entity_id)
             VALUES ('pending_claim', $1)
             RETURNING id`,
            [personEntityId]
          );
          accountId = insAcc.rows[0].id;
          countAccounts++;
        } else {
          accountId = resAcc.rows[0].id;
        }

        // Auth Challenge
        const digestBuffer = Buffer.from(sha256Hex(item.claim_code), 'hex');
        await client.query(
          `INSERT INTO auth_challenges (id, challenge_digest, purpose, account_id, expires_at)
           VALUES (gen_random_uuid(), $1, 'claim_account', $2, NOW() + INTERVAL '30 days')
           ON CONFLICT (challenge_digest) DO NOTHING`,
          [digestBuffer, accountId]
        );

        // Wallet Reserved
        await client.query(
          `INSERT INTO wallets (entity_id, wallet_type, wallet_status)
           VALUES ($1, 'passkey', 'reserved')
           ON CONFLICT DO NOTHING`,
          [personEntityId]
        );
      }
    } else {
      // Process Artistic Presentation Rows
      const createdSchools = new Map();
      for (const [slug, s] of schoolsMap.entries()) {
        let r = await client.query('SELECT id FROM entities WHERE slug = $1', [slug]);
        let orgId;
        if (r.rows.length === 0) {
          const inserted = await client.query(
            `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
             VALUES ('organization', $1, $2, 'Chile', 'Santiago', 'verified', true, true)
             RETURNING id`,
            [s.name, slug]
          );
          orgId = inserted.rows[0].id;
          await client.query(
            `INSERT INTO organizations (entity_id, organization_type, contact_name, contact_email, contact_phone)
             VALUES ($1, 'school', $2, $3, $4)`,
            [orgId, s.name, s.contactEmail, s.contactPhone]
          );
        } else {
          orgId = r.rows[0].id;
        }
        createdSchools.set(slug, orgId);
      }
      console.log(`  ✅ ${createdSchools.size} Escuelas procesadas`);

      for (const item of manifest) {
        const isSolista = item.tipo_participacion.toLowerCase().includes('solista');
        const email = item.email_contacto;
        const personSlug = slugify(item.nombre_encargada || `persona-${item.numero_presentacion}`);

        let personEntityId;
        let existingPerson = await client.query(
          `SELECT entity_id FROM people WHERE email = $1 LIMIT 1`,
          [email]
        );

        if (existingPerson.rows.length > 0) {
          personEntityId = existingPerson.rows[0].entity_id;
        } else {
          const pEnt = await client.query(
            `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
             VALUES ('person', $1, $2, 'Chile', 'Santiago', 'verified', true, true)
             RETURNING id`,
            [item.nombre_encargada, personSlug]
          );
          personEntityId = pEnt.rows[0].id;
          await client.query(
            `INSERT INTO people (entity_id, artistic_name, email, main_role)
             VALUES ($1, $2, $3, $4)`,
            [personEntityId, item.nombre_encargada, email, isSolista ? 'dancer' : 'director']
          );
        }

        let subjectEntityId = personEntityId;
        if (!isSolista && item.nombre_escuela) {
          const schoolSlug = slugify(item.nombre_escuela);
          if (createdSchools.has(schoolSlug)) {
            subjectEntityId = createdSchools.get(schoolSlug);

            await client.query(
              `INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, status)
               VALUES ($1, $2, 'director_of', 'active')
               ON CONFLICT DO NOTHING`,
              [personEntityId, subjectEntityId]
            );
          }
        }

        await client.query(
          `INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status, notes)
           VALUES ($1, $2, 'participant_of', $2, 'active', $3)
           ON CONFLICT DO NOTHING`,
          [subjectEntityId, eventEntityId, `Presentación #${item.numero_presentacion}: ${item.nombre_baile}`]
        );

        await client.query(
          `INSERT INTO participations (subject_entity_id, event_id, state)
           VALUES ($1, $2, 'registered')
           ON CONFLICT (subject_entity_id, event_id) DO NOTHING`,
          [subjectEntityId, eventEntityId]
        );

        const metadataHash = sha256Hex(`FDVC2026:${item.numero_presentacion}:${item.nombre_baile}`);
        const credType = isSolista ? 1 : 2;
        await client.query(
          `INSERT INTO credentials (credential_code, issuer_entity_id, issued_by, subject_entity_id, event_id, credential_type, metadata_hash, hash_schema, status, title, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'issued', $8, $9)
           ON CONFLICT (issuer_entity_id, subject_entity_id, event_id, credential_type) DO NOTHING`,
          [item.credential_code, fdvcOrgEntityId, adminAccountId, subjectEntityId, eventEntityId, credType, metadataHash, item.titulo_credencial, item.descripcion_credencial]
        );
        countCreds++;

        let resAcc = await client.query('SELECT id FROM accounts WHERE person_entity_id = $1', [personEntityId]);
        let accountId;
        if (resAcc.rows.length === 0) {
          const insAcc = await client.query(
            `INSERT INTO accounts (status, person_entity_id)
             VALUES ('pending_claim', $1)
             RETURNING id`,
            [personEntityId]
          );
          accountId = insAcc.rows[0].id;
          countAccounts++;
        } else {
          accountId = resAcc.rows[0].id;
        }

        const digestBuffer = Buffer.from(sha256Hex(item.claim_code), 'hex');
        await client.query(
          `INSERT INTO auth_challenges (id, challenge_digest, purpose, account_id, expires_at)
           VALUES (gen_random_uuid(), $1, 'claim_account', $2, NOW() + INTERVAL '30 days')
           ON CONFLICT (challenge_digest) DO NOTHING`,
          [digestBuffer, accountId]
        );

        await client.query(
          `INSERT INTO wallets (entity_id, wallet_type, wallet_status)
           VALUES ($1, 'passkey', 'reserved')
           ON CONFLICT DO NOTHING`,
          [subjectEntityId]
        );
      }
    }

    await client.query('COMMIT');

    writeFileSync(manifestOutput, JSON.stringify(manifest, null, 2));

    console.log(`  ✅ Inserción completada con éxito.`);
    console.log(`  • Cuentas creadas/verificadas : ${countAccounts}`);
    console.log(`  • Credenciales emitidas     : ${countCreds}`);
    console.log(`  • Manifiesto guardado en    : ${manifestOutput}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error durante la inserción en BD:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
