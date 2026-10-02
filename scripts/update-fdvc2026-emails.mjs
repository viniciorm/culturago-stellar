#!/usr/bin/env node
/**
 * scripts/update-fdvc2026-emails.mjs
 *
 * Actualizador / Dry-Run de Contactos Operacionales (Emails) del Piloto FDVC 2026.
 * Asocia registration_email y credential_delivery_email a nivel de participaciones.
 *
 * Invariantes de Lore aplicadas:
 *   - registration_email != identidad cultural
 *   - credential_delivery_email != sujeto
 *   - director_of / teacher_at no implica performed_in
 *   - Membresía escolar != participación escénica
 *   - 0 mutaciones on-chain, CULTURAGO_ALLOW_TESTNET_MUTATIONS=false
 *
 * Modos:
 *   --dry-run (por defecto)
 *   --apply   (requiere aprobación explícita)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 1. Carga de mapeo de contactos operacionales desde archivo JSON desacoplado
// Por defecto lee data/fdvc2026_emails.json (ignorado por Git) o data/fdvc2026_emails.example.json
function loadEmailsMap(emailsFilePath) {
  let targetPath = emailsFilePath;
  if (!targetPath) {
    const defaultJson = path.join(PROJECT_ROOT, 'data', 'fdvc2026_emails.json');
    const exampleJson = path.join(PROJECT_ROOT, 'data', 'fdvc2026_emails.example.json');
    if (fs.existsSync(defaultJson)) {
      targetPath = defaultJson;
    } else if (fs.existsSync(exampleJson)) {
      targetPath = exampleJson;
    } else {
      throw new Error(`No se encontró archivo de correos en ${defaultJson} ni en ${exampleJson}`);
    }
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Archivo de correos especificado no encontrado: ${targetPath}`);
  }

  const raw = fs.readFileSync(targetPath, 'utf8');
  const parsed = JSON.parse(raw);
  const emailsMap = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k.startsWith('FDVC2026-') && typeof v === 'string') {
      emailsMap[k] = v.trim();
    }
  }
  return { emailsMap, sourcePath: targetPath };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let file = path.join(PROJECT_ROOT, 'data', 'culturago_fdvc2026_exportacion.txt');
  let emailsFile = null;
  let apply = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      file = path.resolve(args[++i]);
    } else if (args[i] === '--emails' && args[i + 1]) {
      emailsFile = path.resolve(args[++i]);
    } else if (args[i] === '--apply') {
      apply = true;
    } else if (args[i] === '--dry-run') {
      apply = false;
    }
  }

  return { file, emailsFile, apply };
}

function parseExportFile(filePath, emailsMap) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo de exportación no encontrado: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const blocks = content.split(/={40,}/).filter((b) => b.includes('Clave de presentación:') && /Presentación:\s*\d+/.test(b));

  const presentations = [];
  for (const block of blocks) {
    const getVal = (regex) => {
      const match = block.match(regex);
      return match ? match[1].trim() : '';
    };

    const code = getVal(/Clave de presentación:\s*(FDVC2026-\d{3})/);
    const num = parseInt(getVal(/Presentación:\s*(\d+)/), 10);
    const tipo = getVal(/Tipo de participación:\s*([^\r\n]+)/);
    const persona = getVal(/Persona principal:\s*([^\r\n]+)/);
    const escuela = getVal(/Escuela \/ organización:\s*([^\r\n]+)/);
    const grupo = getVal(/Grupo \/ ballet \/ compañía:\s*([^\r\n]+)/);
    const estilo = getVal(/Estilo \/ baile \(secundario\):\s*([^\r\n]+)/);

    if (code) {
      let subject;
      if (tipo === 'Solista') {
        subject = persona;
      } else {
        // En presentación 11, resolver canónicamente contra Grupo Mahaila May y alumnas
        if (num === 11 || grupo === 'Por confirmar') {
          subject = 'Grupo Mahaila May y alumnas';
        } else {
          subject = grupo;
        }
      }

      const regEmail = emailsMap[code] || null;
      // En esta etapa inicial de inscripción, credential_delivery_email = registration_email
      const deliveryEmail = regEmail;

      presentations.push({
        code,
        num,
        tipo,
        persona,
        escuela,
        grupo,
        subject,
        estilo,
        registration_email: regEmail,
        credential_delivery_email: deliveryEmail,
      });
    }
  }

  return presentations.sort((a, b) => a.num - b.num);
}

function computeStats(presentations) {
  let solistas = 0;
  let grupales = 0;
  let emailsFound = 0;
  let emailsMissing = 0;
  const emailCounts = new Map(); // email -> list of presentation codes
  const missingPresentations = [];

  for (const p of presentations) {
    if (p.tipo === 'Solista') solistas++;
    else if (p.tipo === 'Grupal') grupales++;

    if (p.registration_email) {
      emailsFound++;
      if (!emailCounts.has(p.registration_email)) {
        emailCounts.set(p.registration_email, []);
      }
      emailCounts.get(p.registration_email).push(p.code);
    } else {
      emailsMissing++;
      missingPresentations.push(p);
    }
  }

  const sharedEmails = [];
  for (const [email, codes] of emailCounts.entries()) {
    if (codes.length > 1) {
      sharedEmails.push({ email, count: codes.length, codes });
    }
  }

  return {
    totalPresentations: presentations.length,
    solistas,
    grupales,
    emailsFound,
    emailsMissing,
    uniqueEmails: emailCounts.size,
    sharedEmails,
    missingPresentations,
  };
}

import pg from 'pg';

const { Client } = pg;

function loadEnvFile() {
  const envPath = path.resolve('/opt/culturago/.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
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

function getSubjectSlug(p) {
  const num = p.num;
  if (p.tipo === 'Solista') {
    if (num === 1) return 'ana-francisca-pizarro-ruiz';
    if (num === 6) return 'adriana-campos';
    if (num === 8) return 'daisy-bustos-sanchez';
    if (num === 9) return 'priscilla-bellydancer';
    if (num === 12) return 'mabel-casandra-parra-albarran';
    if (num === 17) return 'sofia-martinez';
    if (num === 23) return 'nazarena';
    if (num === 24) return 'raquel-farias';
    if (num === 27) return 'nazli-constanza';
    if (num === 28) return 'shazadi';
    if (num === 29) return 'diana-valle';
    if (num === 30) return 'anne-marie-lolas';
  } else {
    if (num === 2) return 'grupo-shazaditas-teens';
    if (num === 3) return 'grupo-shazaditas-evolution';
    if (num === 4) return 'grupo-shazaditas-essence';
    if (num === 5) return 'ballet-shazaditas-styles';
    if (num === 7) return 'adarah-bellydance';
    if (num === 10) return 'siembras-de-arte';
    if (num === 11) return 'grupo-mahaila-may-y-alumnas';
    if (num === 13) return 'grupo-escuela-casandra';
    if (num === 14) return 'ballet-arwam-al-shams';
    if (num === 15) return 'tribu-raks-el-hob-grupo';
    if (num === 16) return 'arwah-al-azhar-ballet';
    if (num === 18) return 'ballet-habibi';
    if (num === 19) return 'grupo-aneesa-ballet-will-bellydancer';
    if (num === 20) return 'malaikas';
    if (num === 21) return 'zahra-al-ruh';
    if (num === 22) return 'ballet-alsabalal';
    if (num === 25) return 'samaira-bellydance-company';
    if (num === 26) return 'ballet-nazli';
  }
  throw new Error(`Slug no mapeado para presentación #${num} (${p.code})`);
}

async function main() {
  const { file, emailsFile, apply } = parseArgs();
  const { emailsMap, sourcePath: emailsSource } = loadEmailsMap(emailsFile);

  console.log('\n================================================================');
  console.log('  🎭 CulturaGO — Actualizador de Contactos Operacionales FDVC 2026');
  console.log('================================================================');
  console.log(`  • Modo                   : ${apply ? '🚀 APLICAR CAMBIOS (--apply)' : '🔍 DRY RUN (Simulación sin escritura)'}`);
  console.log(`  • Archivo Fuente         : ${file}`);
  console.log(`  • Mapeo de Emails        : ${emailsSource}`);
  console.log(`  • Stellar Mutations Gate : CULTURAGO_ALLOW_TESTNET_MUTATIONS=false`);
  console.log('================================================================\n');

  const presentations = parseExportFile(file, emailsMap);
  const stats = computeStats(presentations);

  // Tabla detallada de las 30 presentaciones
  console.log('-------------------------------------------------------------------------------------------------------------------------------------------------------');
  console.log(
    '| ' +
    'CÓDIGO'.padEnd(12) + '| ' +
    'TIPO'.padEnd(9) + '| ' +
    'SUJETO (CULTURAL)'.padEnd(38) + '| ' +
    'REGISTRATION_EMAIL'.padEnd(36) + '| ' +
    'DELIVERY_EMAIL'.padEnd(36) + '|'
  );
  console.log('-------------------------------------------------------------------------------------------------------------------------------------------------------');

  for (const p of presentations) {
    const code = p.code.padEnd(12);
    const tipo = p.tipo.padEnd(9);
    const subject = (p.subject.length > 36 ? p.subject.substring(0, 33) + '...' : p.subject).padEnd(38);
    const regEmail = (p.registration_email || '⚠️ PENDIENTE (NO INFORMADO)').padEnd(36);
    const delEmail = (p.credential_delivery_email || '⚠️ PENDIENTE (NO INFORMADO)').padEnd(36);

    console.log(`| ${code}| ${tipo}| ${subject}| ${regEmail}| ${delEmail}|`);
  }
  console.log('-------------------------------------------------------------------------------------------------------------------------------------------------------\n');

  // Resumen Estadístico
  console.log('================================================================');
  console.log('  📊 RESUMEN OPERACIONAL DE CORREOS');
  console.log('================================================================');
  console.log(`  • Presentaciones encontradas       : ${stats.totalPresentations}`);
  console.log(`  • Solistas                         : ${stats.solistas}`);
  console.log(`  • Grupales                         : ${stats.grupales}`);
  console.log(`  • Emails verificados encontrados   : ${stats.emailsFound}`);
  console.log(`  • Emails faltantes / pendientes    : ${stats.emailsMissing}`);
  console.log(`  • Emails únicos distintos          : ${stats.uniqueEmails}`);
  console.log(`  • Emails compartidos por varias pres: ${stats.sharedEmails.length}`);
  console.log('----------------------------------------------------------------');

  if (stats.sharedEmails.length > 0) {
    console.log('\n  📋 Detalle de Correos Compartidos (Inscripciones de Escuela / Directora):');
    for (const s of stats.sharedEmails) {
      console.log(`    - ${s.email} (${s.count} presentaciones: ${s.codes.join(', ')})`);
    }
  }

  if (stats.missingPresentations.length > 0) {
    console.log('\n  ⚠️ Presentaciones con Correo Pendiente (NO inventados, marcados formalmente):');
    for (const m of stats.missingPresentations) {
      console.log(`    - ${m.code} [${m.tipo}]: ${m.subject} (${m.escuela})`);
    }
  }

  console.log('\n================================================================');
  console.log('  🛡️ GUARDRAILS Y VERIFICACIÓN DE PERÍMETRO');
  console.log('================================================================');
  console.log('  • Accounts creadas             : 0');
  console.log('  • Claim codes generados        : 0');
  console.log('  • Passkeys registradas         : 0');
  console.log('  • Wallets creadas              : 0');
  console.log('  • Smart Wallets desplegadas    : 0');
  console.log('  • Credenciales on-chain        : 0');
  console.log('  • Stellar Operations           : 0');
  console.log('  • CULTURAGO_ALLOW_TESTNET_MUTATIONS: false');
  console.log('================================================================\n');

  if (!apply) {
    console.log('ℹ️  Modo DRY RUN completado. Ninguna fila ha sido modificada en PostgreSQL.');
    console.log('ℹ️  Para aplicar en producción se requerirá ejecutar con --apply tras aprobación de Marcos.\n');
    return;
  }

  // ---------- Execution Mode (--apply) ----------
  loadEnvFile();
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL no encontrada en el entorno ni en /opt/culturago/.env');
    process.exit(1);
  }

  // Fallback para ejecución en el host fuera de la red interna de Docker Compose
  if (dbUrl.includes('culturago-postgres')) {
    try {
      const dns = await import('node:dns/promises');
      await dns.lookup('culturago-postgres');
    } catch {
      dbUrl = dbUrl.replace('@culturago-postgres:', '@172.20.0.2:').replace('@culturago-postgres/', '@172.20.0.2/');
    }
  }

  console.log('================================================================');
  console.log('  ⚙️ CONECTANDO A POSTGRESQL Y APLICANDO CONTACTOS OPERACIONALES');
  console.log('================================================================\n');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Ejecutar migración 0013 de forma estrictamente idempotente
    console.log('  [1/4] Aplicando migración 0013 (idempotente)...');
    await client.query(`
      ALTER TABLE participations
          ADD COLUMN IF NOT EXISTS presentation_code VARCHAR(32),
          ADD COLUMN IF NOT EXISTS registration_email TEXT,
          ADD COLUMN IF NOT EXISTS credential_delivery_email TEXT;

      CREATE INDEX IF NOT EXISTS idx_participations_presentation_code
          ON participations (event_id, presentation_code);
    `);
    console.log('        ✅ Columnas e índice verificados en tabla participations.');

    // 2. Buscar entidad del evento fdvc-2026
    const resEv = await client.query("SELECT id FROM entities WHERE slug = 'fdvc-2026'");
    if (resEv.rows.length === 0) {
      throw new Error("Entidad evento 'fdvc-2026' no encontrada en entities");
    }
    const eventEntityId = resEv.rows[0].id;

    // 3. Actualizar las 30 participaciones exactamente
    console.log('\n  [2/4] Actualizando las 30 participaciones con sus códigos y correos...');
    let updatedCount = 0;
    const updateResults = [];

    for (const p of presentations) {
      const slug = getSubjectSlug(p);
      const resSubject = await client.query('SELECT id FROM entities WHERE slug = $1', [slug]);
      if (resSubject.rows.length === 0) {
        throw new Error(`Entidad sujeto no encontrada para slug: '${slug}' (Presentación ${p.code})`);
      }
      const subjectId = resSubject.rows[0].id;

      const resUpd = await client.query(`
        UPDATE participations
        SET
          presentation_code = $1,
          registration_email = $2,
          credential_delivery_email = $3,
          updated_at = NOW()
        WHERE event_id = $4 AND subject_entity_id = $5
        RETURNING id, presentation_code, registration_email, credential_delivery_email
      `, [p.code, p.registration_email, p.credential_delivery_email, eventEntityId, subjectId]);

      if (resUpd.rows.length !== 1) {
        throw new Error(`Se esperaba actualizar exactamente 1 fila para ${p.code} (${slug}), pero se actualizaron ${resUpd.rows.length}`);
      }

      updatedCount++;
      updateResults.push({
        code: p.code,
        subject: p.subject,
        slug,
        regEmail: resUpd.rows[0].registration_email,
        delEmail: resUpd.rows[0].credential_delivery_email,
      });
    }

    // 4. Verificación de integridad post-update antes del COMMIT
    console.log('\n  [3/4] Verificando integridad de datos en participations...');
    const checkRes = await client.query(`
      SELECT
        COUNT(*) as total_participations,
        COUNT(presentation_code) as with_code,
        COUNT(registration_email) as with_reg_email,
        COUNT(credential_delivery_email) as with_del_email
      FROM participations
      WHERE event_id = $1
    `, [eventEntityId]);

    const row = checkRes.rows[0];
    console.log(`        • Total participaciones en evento: ${row.total_participations}`);
    console.log(`        • Con presentation_code          : ${row.with_code}`);
    console.log(`        • Con registration_email         : ${row.with_reg_email}`);
    console.log(`        • Con credential_delivery_email  : ${row.with_del_email}`);

    if (parseInt(row.with_code, 10) !== 30 || parseInt(row.with_reg_email, 10) !== 30 || parseInt(row.with_del_email, 10) !== 30) {
      throw new Error(`Verificación fallida: no todas las 30 participaciones tienen campos completos: ${JSON.stringify(row)}`);
    }

    // 5. Confirmar transacción
    await client.query('COMMIT');
    console.log('\n  [4/4] 🎉 COMMIT exitoso. Transacción persistida en PostgreSQL.\n');

    // 6. Reporte final post-apply
    console.log('================================================================');
    console.log('  📊 REPORTE POST-APPLY OFICIAL');
    console.log('================================================================');
    console.log(`  1. Migración 0013 aplicada exitosamente de forma idempotente.`);
    console.log(`  2. Participaciones actualizadas        : ${updatedCount} de 30.`);
    console.log(`  3. Confirmación presentation_code      : 30/30 (100%).`);
    console.log(`  4. Confirmación registration_email     : 30/30 (100%).`);
    console.log(`  5. Confirmación credential_delivery_email: 30/30 (100%).`);
    console.log('----------------------------------------------------------------');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR durante la ejecución en BD (ROLLBACK efectuado):', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Error durante la ejecución:', err);
  process.exit(1);
});
