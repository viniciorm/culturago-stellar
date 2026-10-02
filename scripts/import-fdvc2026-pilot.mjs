#!/usr/bin/env node
/**
 * scripts/import-fdvc2026-pilot.mjs
 *
 * Importador idempotente del Piloto FDVC 2026 para CulturaGO.
 * Fuente oficial: archivo TXT normalizado (data/culturago_fdvc2026_exportacion.txt).
 *
 * Modelo Conceptual:
 *   EVENTO (FDVC 2026)
 *   └── ESCUELA / ORGANIZACIÓN
 *       ├── PERSONA / PROFESORA / DIRECTORA
 *       └── GRUPO / BALLET / COMPAÑÍA
 *           └── PARTICIPACIÓN
 *   Además, PERSONA puede participar directamente como SOLISTA.
 *
 * Restricciones estrictas:
 *   - No crear usuarios de login, claim codes, auth_challenges, passkeys,
 *     smart wallets, smart_wallet_claims, contratos, credenciales on-chain
 *     ni transacciones Stellar.
 *   - Operación por defecto en DRY RUN (--dry-run).
 *   - Requiere flag explícito --apply para escribir en PostgreSQL.
 *   - CULTURAGO_ALLOW_TESTNET_MUTATIONS=false.
 *
 * Uso:
 *   Dry-run (por defecto):
 *     node scripts/import-fdvc2026-pilot.mjs
 *     node scripts/import-fdvc2026-pilot.mjs --file data/culturago_fdvc2026_exportacion.txt --dry-run
 *
 *   Aplicación real en PostgreSQL:
 *     node scripts/import-fdvc2026-pilot.mjs --file data/culturago_fdvc2026_exportacion.txt --apply
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

// ---------- Parse CLI Arguments ----------

function parseArgs() {
  const args = process.argv.slice(2);
  let file = 'data/culturago_fdvc2026_exportacion.txt';
  let apply = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      file = args[i + 1];
      i++;
    } else if (args[i] === '--apply') {
      apply = true;
    } else if (args[i] === '--dry-run') {
      apply = false;
    }
  }

  return { file: resolve(file), apply };
}

// ---------- Helper Utilities ----------

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

// ---------- TXT Parser ----------

export function parseExportTxt(content) {
  const blocks = content
    .split(/={30,}/)
    .map((b) => b.trim())
    .filter((b) => b.startsWith('Presentación:'));

  return blocks.map((b) => {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    const data = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const k = line.slice(0, colonIdx).trim();
        const v = line.slice(colonIdx + 1).trim();
        data[k] = v;
      }
    }
    return {
      num: parseInt(data['Presentación'], 10),
      code: data['Clave de presentación'] || `FDVC2026-PRES-${String(data['Presentación']).padStart(3, '0')}`,
      evento: data['Evento'] || 'FDVC 2026',
      personaRaw: data['Persona principal'] || '',
      escuelaRaw: data['Escuela / organización'] || '',
      grupoRaw: data['Grupo / ballet / compañía'] || '',
      tipo: data['Tipo de participación'] || '',
      rol: data['Rol principal'] || '',
      relacion: data['Relación principal'] || '',
      estilo: data['Estilo / baile (secundario)'] || '',
      estadoRevision: data['Estado de revisión'] || '',
      observaciones: data['Observaciones'] || '',
    };
  });
}

// ---------- Domain Normalizer & Entities Catalog ----------

export function normalizePilotData(presentations) {
  // Mapa de Personas únicas canónicas
  // Clave canónica -> { slug, displayName, artisticName, legalName, mainRole }
  const peopleCatalog = new Map();

  function registerPerson(key, { displayName, artisticName, legalName, mainRole = 'dancer' }) {
    if (!peopleCatalog.has(key)) {
      peopleCatalog.set(key, {
        key,
        slug: slugify(key),
        displayName,
        artisticName: artisticName || displayName,
        legalName: legalName || null,
        mainRole,
      });
    }
    return peopleCatalog.get(key);
  }

  // Mapa de Escuelas únicas
  // Nombre canónico -> { slug, name, type }
  const schoolsCatalog = new Map();

  function registerSchool(name) {
    if (!name || name === 'No informada') return null;
    const slug = slugify(name);
    if (!schoolsCatalog.has(slug)) {
      schoolsCatalog.set(slug, {
        slug,
        name,
        type: name.toLowerCase().includes('academia') ? 'academy' : 'school',
      });
    }
    return schoolsCatalog.get(slug);
  }

  // Mapa de Grupos/Ballets únicos
  // Slug único -> { slug, name, type, associatedSchoolSlug, associatedSchoolName, isProvisional }
  const groupsCatalog = new Map();

  function resolveGroupForPresentation(p) {
    if (!p.grupoRaw || p.grupoRaw === 'No aplica') return null;
    let groupName = p.grupoRaw;
    let customSlug = null;
    let isProvisional = false;

    // Caso presentación 11: "Por confirmar" -> "Grupo Mahaila May y alumnas"
    if (p.num === 11 || groupName === 'Por confirmar') {
      groupName = 'Grupo Mahaila May y alumnas';
      customSlug = 'grupo-mahaila-may-y-alumnas';
      isProvisional = true;
    }

    // Caso Tribu Raks El Hob: evitar colisión con el slug de la escuela en la tabla entities (slug UNIQUE)
    if (groupName === 'Tribu Raks El Hob') {
      customSlug = 'tribu-raks-el-hob-grupo';
    }

    const slug = customSlug || slugify(groupName);

    if (!groupsCatalog.has(slug)) {
      let type = 'company';
      const lower = groupName.toLowerCase();
      if (lower.includes('ballet') || lower.includes('tribu') || lower.includes('grupo') || lower.includes('company')) {
        type = 'company';
      }
      groupsCatalog.set(slug, {
        slug,
        name: groupName,
        type,
        associatedSchoolSlug: p.escuelaRaw && p.escuelaRaw !== 'No informada' ? slugify(p.escuelaRaw) : null,
        associatedSchoolName: p.escuelaRaw && p.escuelaRaw !== 'No informada' ? p.escuelaRaw : null,
        isProvisional,
      });
    }

    return groupsCatalog.get(slug);
  }

  // Catálogo de mapeo de persona por presentación según las reglas de identidad
  function resolvePersonForPresentation(p) {
    const raw = p.personaRaw;
    const num = p.num;

    // Reglas canónicas fundamentadas en las observaciones del TXT oficial:
    if (num === 1) {
      return registerPerson('ana-francisca-pizarro-ruiz', {
        displayName: 'Ana Francisca Pizarro Ruiz',
        artisticName: 'Ana Francisca Pizarro Ruiz',
        mainRole: 'dancer',
      });
    }
    if ([2, 3, 4, 5, 28].includes(num)) {
      return registerPerson('shazadi', {
        displayName: 'Shazadi',
        artisticName: 'Shazadi',
        legalName: 'Yisley',
        mainRole: 'director',
      });
    }
    if (num === 6) {
      return registerPerson('adriana-campos', {
        displayName: 'Adriana Campos',
        artisticName: 'Adriana Campos',
        mainRole: 'teacher',
      });
    }
    if (num === 7) {
      return registerPerson('cristina-fuentes', {
        displayName: 'Cristina Fuentes',
        artisticName: 'Cristina Fuentes',
        mainRole: 'teacher',
      });
    }
    if (num === 8) {
      return registerPerson('daisy-bustos-sanchez', {
        displayName: 'Daisy Bustos Sánchez',
        artisticName: 'Kardelens',
        legalName: 'Daisy Bustos Sánchez',
        mainRole: 'dancer',
      });
    }
    if ([9, 15].includes(num)) {
      return registerPerson('priscilla-bellydancer', {
        displayName: 'Priscilla Bellydancer',
        artisticName: 'Priscilla Bellydancer',
        mainRole: 'director',
      });
    }
    if (num === 10) {
      return registerPerson('fabiola-andrade-benavides', {
        displayName: 'Fabiola Andrade Benavides',
        artisticName: 'Fabiola Andrade Benavides',
        mainRole: 'director',
      });
    }
    if (num === 11) {
      return registerPerson('maria-soledad-lazo', {
        displayName: 'María Soledad Lazo',
        artisticName: 'Mahaila',
        legalName: 'María Soledad Lazo',
        mainRole: 'director',
      });
    }
    if ([12, 13].includes(num)) {
      return registerPerson('mabel-casandra-parra-albarran', {
        displayName: 'Mabel Casandra Parra Albarran',
        artisticName: 'Casandra',
        legalName: 'Mabel Casandra Parra Albarran',
        mainRole: 'director',
      });
    }
    if ([14, 22].includes(num)) {
      return registerPerson('farida-warda', {
        displayName: 'Farida Warda',
        artisticName: 'Farida Warda',
        mainRole: 'director',
      });
    }
    if (num === 16) {
      return registerPerson('vania-sayes', {
        displayName: 'Vania Sayes',
        artisticName: 'Vania Sayes',
        mainRole: 'director',
      });
    }
    if (num === 17) {
      return registerPerson('sofia-martinez', {
        displayName: 'Sofía Martínez',
        artisticName: 'Sofía Martínez',
        mainRole: 'dancer',
      });
    }
    if (num === 18) {
      return registerPerson('cristina-acevedo', {
        displayName: 'Cristina Acevedo',
        artisticName: 'Cristina Acevedo',
        mainRole: 'director',
      });
    }
    if (num === 19) {
      return registerPerson('wilma-galleguillos-fuentes', {
        displayName: 'Wilma Galleguillos Fuentes',
        artisticName: 'Wilma Galleguillos Fuentes',
        mainRole: 'director',
      });
    }
    if (num === 20) {
      return registerPerson('dana-amar', {
        displayName: 'Dana Amar',
        artisticName: 'Dana Amar',
        mainRole: 'director',
      });
    }
    if (num === 21) {
      return registerPerson('danahe-zablah', {
        displayName: 'Danahe Zablah',
        artisticName: 'Danahe Zablah',
        mainRole: 'teacher',
      });
    }
    if (num === 23) {
      return registerPerson('nazarena', {
        displayName: 'Nazarena',
        artisticName: 'Nazarena',
        mainRole: 'dancer',
      });
    }
    if (num === 24) {
      return registerPerson('raquel-farias', {
        displayName: 'Raquel Farias',
        artisticName: 'Raquel Farias',
        mainRole: 'teacher',
      });
    }
    if (num === 25) {
      return registerPerson('samaira-laura-salinas', {
        displayName: 'Samaira Laura Salinas',
        artisticName: 'Samaira Laura Salinas',
        mainRole: 'director',
      });
    }
    if ([26, 27].includes(num)) {
      return registerPerson('nazli-constanza', {
        displayName: 'Nazli Constanza',
        artisticName: 'Nazli Constanza',
        mainRole: 'director',
      });
    }
    if (num === 29) {
      return registerPerson('diana-valle', {
        displayName: 'Diana Valle',
        artisticName: 'Diana Valle',
        mainRole: 'dancer',
      });
    }
    if (num === 30) {
      return registerPerson('anne-marie-lolas', {
        displayName: 'Anne Marie Lolas',
        artisticName: 'Anne Marie Lolas',
        mainRole: 'dancer',
      });
    }

    // Fallback seguro
    const slug = slugify(raw);
    return registerPerson(slug, {
      displayName: raw,
      artisticName: raw,
      mainRole: 'dancer',
    });
  }

  // Procesar catálogos
  for (const p of presentations) {
    resolvePersonForPresentation(p);
    if (p.escuelaRaw && p.escuelaRaw !== 'No informada') {
      registerSchool(p.escuelaRaw);
    }
    if (p.grupoRaw && p.grupoRaw !== 'No aplica') {
      resolveGroupForPresentation(p);
    }
  }

  // Registrar personas adicionales mencionadas en roles de enseñanza en observaciones:
  // Adriana Campos como profesora en pres 1
  registerPerson('adriana-campos', {
    displayName: 'Adriana Campos',
    artisticName: 'Adriana Campos',
    mainRole: 'teacher',
  });
  // Dana Amar como profesora en pres 23
  registerPerson('dana-amar', {
    displayName: 'Dana Amar',
    artisticName: 'Dana Amar',
    mainRole: 'director',
  });

  // Generar Relaciones
  // 1. Grupo -> Escuela (member_of)
  const groupSchoolRelationships = [];
  for (const g of groupsCatalog.values()) {
    if (g.associatedSchoolSlug && schoolsCatalog.has(g.associatedSchoolSlug)) {
      const isIndependentOrigin = g.slug === 'zahra-al-ruh';
      groupSchoolRelationships.push({
        groupSlug: g.slug,
        groupName: g.name,
        schoolSlug: g.associatedSchoolSlug,
        schoolName: g.associatedSchoolName,
        type: 'member_of',
        notes: isIndependentOrigin
          ? 'Grupo independiente surgido al alero de Escuela Dana Amar'
          : g.isProvisional
          ? `Grupo/Ballet provisional perteneciente a ${g.associatedSchoolName} (Pendiente de confirmación)`
          : `Grupo/Ballet perteneciente a ${g.associatedSchoolName}`,
      });
    }
  }

  // 2. Persona -> Escuela
  const personSchoolRelationships = [];
  const pSchoolRelSet = new Set();

  function addPersonSchoolRel(personKey, schoolName, type, notes) {
    if (!schoolName || schoolName === 'No informada') return;
    const schoolSlug = slugify(schoolName);
    const key = `${personKey}::${schoolSlug}::${type}`;
    if (!pSchoolRelSet.has(key)) {
      pSchoolRelSet.add(key);
      const person = peopleCatalog.get(personKey);
      personSchoolRelationships.push({
        personKey,
        personName: person.displayName,
        schoolSlug,
        schoolName,
        type,
        notes,
      });
    }
  }

  for (const p of presentations) {
    const esc = p.escuelaRaw;
    const num = p.num;

    if (num === 1) {
      addPersonSchoolRel('ana-francisca-pizarro-ruiz', esc, 'member_of', 'Solista asociada a la escuela');
      addPersonSchoolRel('adriana-campos', esc, 'teacher_at', 'Figura como profesora en presentación 1');
    } else if (num === 6) {
      addPersonSchoolRel('adriana-campos', esc, 'teacher_at', 'Profesora y participante solista');
    } else if ([2, 3, 4, 5, 28].includes(num)) {
      addPersonSchoolRel('shazadi', esc, 'director_of', 'Profesora y directora de Estudio Shazadi');
    } else if (num === 7) {
      addPersonSchoolRel('cristina-fuentes', esc, 'teacher_at', 'Profesora/encargada en Raks Al Hayat');
    } else if (num === 9) {
      addPersonSchoolRel('priscilla-bellydancer', esc, 'member_of', 'Solista asociada a Raks El Hob');
    } else if (num === 10) {
      addPersonSchoolRel('fabiola-andrade-benavides', esc, 'director_of', 'Profesora/directora de Escuela Fabiola Andrade');
    } else if (num === 11) {
      addPersonSchoolRel('maria-soledad-lazo', esc, 'director_of', 'Profesora/encargada Mahaila May y alumnas');
    } else if ([12, 13].includes(num)) {
      addPersonSchoolRel('mabel-casandra-parra-albarran', esc, 'director_of', 'Profesora/directora de Escuela Casandra');
    } else if ([14, 22].includes(num)) {
      addPersonSchoolRel('farida-warda', esc, 'director_of', 'Profesora/directora de Academia Farida Warda');
    } else if (num === 15) {
      addPersonSchoolRel('priscilla-bellydancer', esc, 'director_of', 'Líder / encargada de Tribu Raks El Hob');
    } else if (num === 16) {
      addPersonSchoolRel('vania-sayes', esc, 'director_of', 'Profesora/encargada Sayes Bellydance');
    } else if (num === 18) {
      addPersonSchoolRel('cristina-acevedo', esc, 'director_of', 'Profesora/encargada Habibi Danza Cajón del Maipo');
    } else if (num === 19) {
      addPersonSchoolRel('wilma-galleguillos-fuentes', esc, 'director_of', 'Profesora/directora Escuela Will Bellydancer');
    } else if (num === 20) {
      addPersonSchoolRel('dana-amar', esc, 'director_of', 'Profesora/directora Escuela Dana Amar');
    } else if (num === 21) {
      addPersonSchoolRel('danahe-zablah', esc, 'member_of', 'Profesora/encargada grupo Zahra Al Ruh surgido al alero de Escuela Dana Amar');
    } else if (num === 23) {
      addPersonSchoolRel('nazarena', esc, 'member_of', 'Solista asociada a Escuela Dana Amar');
      addPersonSchoolRel('dana-amar', esc, 'teacher_at', 'Profesora en presentación 23');
    } else if (num === 24) {
      addPersonSchoolRel('raquel-farias', esc, 'director_of', 'Profesora/encargada Mawal');
    } else if (num === 25) {
      addPersonSchoolRel('samaira-laura-salinas', esc, 'director_of', 'Profesora/directora Escuela Samaira');
    } else if ([26, 27].includes(num)) {
      addPersonSchoolRel('nazli-constanza', esc, 'director_of', 'Profesora/directora Escuela Nazli Constanza');
    }
  }

  // 3. Participaciones en el Evento
  // En Solistas: el sujeto es la PERSONA.
  // En Grupales: el sujeto es el GRUPO / BALLET / COMPAÑÍA.
  const participations = [];

  for (const p of presentations) {
    const isSolista = p.tipo === 'Solista';
    if (isSolista) {
      const person = resolvePersonForPresentation(p);
      participations.push({
        presNum: p.num,
        presCode: p.code,
        tipo: 'Solista',
        subjectKind: 'person',
        subjectKey: person.key,
        subjectSlug: person.slug,
        subjectDisplayName: person.displayName,
        estilo: p.estilo,
        notes: `Presentación ${p.code} (Solista): ${p.estilo || 'Sin estilo'}${p.escuelaRaw !== 'No informada' ? ` - ${p.escuelaRaw}` : ''}`,
      });
    } else {
      const group = resolveGroupForPresentation(p);
      participations.push({
        presNum: p.num,
        presCode: p.code,
        tipo: 'Grupal',
        subjectKind: 'organization',
        subjectKey: group.slug,
        subjectSlug: group.slug,
        subjectDisplayName: group.name,
        estilo: p.estilo,
        notes: `Presentación ${p.code} (Grupal): ${p.estilo || 'Sin estilo'} - ${p.escuelaRaw || 'Sin escuela'}${group.isProvisional ? ' (Nombre de grupo provisional por confirmar)' : ''}`,
      });
    }
  }

  return {
    peopleCatalog: Array.from(peopleCatalog.values()),
    schoolsCatalog: Array.from(schoolsCatalog.values()),
    groupsCatalog: Array.from(groupsCatalog.values()),
    groupSchoolRelationships,
    personSchoolRelationships,
    participations,
  };
}

// ---------- Main Execution Flow ----------

async function main() {
  const { file, apply } = parseArgs();

  console.log('\n================================================================');
  console.log('  🎭 CulturaGO — Importador Oficial Piloto FDVC 2026');
  console.log('================================================================');
  console.log(`  Modo        : ${apply ? '🚀 APLICAR EN POSTGRESQL (--apply)' : '🔍 DRY RUN (Validación estricta)'}`);
  console.log(`  Archivo     : ${file}\n`);

  if (!existsSync(file)) {
    console.error(`❌ Error crítico: El archivo "${file}" no existe.`);
    process.exit(1);
  }

  const content = readFileSync(file, 'utf8');
  const presentations = parseExportTxt(content);

  // Validación estricta de totales
  const totalPres = presentations.length;
  const solistas = presentations.filter((p) => p.tipo === 'Solista');
  const grupales = presentations.filter((p) => p.tipo === 'Grupal');
  const porRevisar = presentations.filter((p) => p.estadoRevision === 'Por revisar');

  console.log('----------------------------------------------------------------');
  console.log('  1. VERIFICACIÓN DE FUENTE NORMALIZADA');
  console.log('----------------------------------------------------------------');
  console.log(`  • Total presentaciones leídas : ${totalPres} (Esperado: 30)`);
  console.log(`  • Presentaciones solistas    : ${solistas.length} (Esperado: 12)`);
  console.log(`  • Presentaciones grupales    : ${grupales.length} (Esperado: 18)`);
  console.log(`  • Registros "Por revisar"    : ${porRevisar.length} (Esperado: 8)`);

  if (totalPres !== 30 || solistas.length !== 12 || grupales.length !== 18) {
    console.error('\n❌ ERROR CRÍTICO: Los totales no coinciden con el resumen oficial.');
    console.error(`   Esperado : 30 presentaciones (12 solistas, 18 grupales)`);
    console.error(`   Obtenido : ${totalPres} presentaciones (${solistas.length} solistas, ${grupales.length} grupales)`);
    console.error('   DETENIENDO EJECUCIÓN INMEDIATAMENTE.');
    process.exit(1);
  }

  const normalized = normalizePilotData(presentations);

  console.log('\n----------------------------------------------------------------');
  console.log('  2. CATÁLOGO DE IDENTIDADES CULTURALES DETECTADAS');
  console.log('----------------------------------------------------------------');
  console.log(`  • Personas canónicas únicas  : ${normalized.peopleCatalog.length}`);
  console.log(`  • Escuelas / Org contexto    : ${normalized.schoolsCatalog.length}`);
  console.log(`  • Grupos / Ballets / Elencos : ${normalized.groupsCatalog.length}`);
  console.log(`  • Relaciones Grupo → Escuela : ${normalized.groupSchoolRelationships.length}`);
  console.log(`  • Relaciones Persona → Esc.  : ${normalized.personSchoolRelationships.length}`);
  console.log(`  • Participaciones en Evento  : ${normalized.participations.length} (12 solistas + 18 grupales)`);

  console.log('\n----------------------------------------------------------------');
  console.log('  3. DETALLE DE PERSONAS CANÓNICAS');
  console.log('----------------------------------------------------------------');
  normalized.peopleCatalog.forEach((p, idx) => {
    console.log(`  [${String(idx + 1).padStart(2, '0')}] ${p.displayName.padEnd(32)} | Rol: ${p.mainRole.padEnd(8)} | Artístico: ${p.artisticName}${p.legalName ? ` | Legal: ${p.legalName}` : ''}`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log('  4. DETALLE DE ESCUELAS / ORGANIZACIONES CONTEXTO');
  console.log('----------------------------------------------------------------');
  normalized.schoolsCatalog.forEach((s, idx) => {
    console.log(`  [${String(idx + 1).padStart(2, '0')}] ${s.name.padEnd(42)} | Tipo: ${s.type.padEnd(8)} | Slug: ${s.slug}`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log('  5. DETALLE DE GRUPOS / BALLETS / COMPAÑÍAS (ENTIDADES INDEPENDIENTES)');
  console.log('----------------------------------------------------------------');
  normalized.groupsCatalog.forEach((g, idx) => {
    console.log(`  [${String(idx + 1).padStart(2, '0')}] ${g.name.padEnd(40)} | Pertenece a: ${g.associatedSchoolName || 'Independiente'}`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log('  6. DETALLE DE RELACIONES GRUPO → ESCUELA');
  console.log('----------------------------------------------------------------');
  normalized.groupSchoolRelationships.forEach((r, idx) => {
    console.log(`  [${String(idx + 1).padStart(2, '0')}] ${r.groupName} → ${r.type} → ${r.schoolName}`);
    console.log(`       Nota: ${r.notes}`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log('  7. DETALLE DE RELACIONES PERSONA → ESCUELA');
  console.log('----------------------------------------------------------------');
  normalized.personSchoolRelationships.forEach((r, idx) => {
    console.log(`  [${String(idx + 1).padStart(2, '0')}] ${r.personName} → ${r.type} → ${r.schoolName}`);
    console.log(`       Nota: ${r.notes}`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log('  8. DETALLE DE PARTICIPACIONES EN EL EVENTO FDVC 2026');
  console.log('----------------------------------------------------------------');
  normalized.participations.forEach((p) => {
    console.log(`  [${p.presCode}] ${p.tipo.padEnd(7)} | Sujeto: ${p.subjectDisplayName.padEnd(38)} (${p.subjectKind}) | Estilo: ${p.estilo}`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log('  9. REGISTROS "POR REVISAR" IDENTIFICADOS');
  console.log('----------------------------------------------------------------');
  porRevisar.forEach((p) => {
    console.log(`  • Pres #${p.num} (${p.code}): ${p.personaRaw} | ${p.escuelaRaw} | ${p.grupoRaw}`);
    console.log(`    Observación: ${p.observaciones}\n`);
  });

  console.log('----------------------------------------------------------------');
  console.log('  10. IMPACTO EN TABLAS DE POSTGRESQL');
  console.log('----------------------------------------------------------------');
  console.log('  Tablas a modificar con inserción idempotente:');
  console.log('  • entities      : Evento FDVC 2026 + Organización FDVC + 22 Personas + 17 Escuelas + 18 Grupos (Total: 59 entidades)');
  console.log('  • people        : 22 registros de personas culturales con nombre artístico y rol principal');
  console.log('  • organizations : 36 registros (1 FDVC + 17 escuelas + 18 grupos)');
  console.log('  • events        : 1 registro asegurado para "Festival Nacional Danza del Vientre Chile 2026"');
  console.log('  • relationships : 39 relaciones culturales (18 grupo→escuela + 21 persona→escuela) + 30 participaciones (Total: 69 relaciones)');
  console.log('  • participations: 30 participaciones auditadas asociadas a FDVC 2026 (12 solistas + 18 grupales)');
  console.log('\n  Tablas EXCLUIDAS de esta carga (No tocadas):');
  console.log('  • accounts, account_roles, issuer_operators');
  console.log('  • passkey_credentials, auth_challenges, sessions, account_claims');
  console.log('  • wallets, smart_wallet_claims, stellar_operations, credentials\n');

  if (!apply) {
    console.log('================================================================');
    console.log('  💡 ESTADO: DRY RUN FINALIZADO CON ÉXITO');
    console.log('     Ningún dato fue escrito en la base de datos.');
    console.log('     Para aplicar esta estructura en PostgreSQL, ejecutar con --apply.');
    console.log('================================================================\n');
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
  console.log('  ⚙️ CONECTANDO A POSTGRESQL Y APLICANDO ESTRUCTURA CULTURAL');
  console.log('================================================================\n');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const report = {
    entitiesCreated: [],
    entitiesReused: [],
    peopleCreated: [],
    peopleReused: [],
    schoolsCreated: [],
    schoolsReused: [],
    groupsCreated: [],
    groupsReused: [],
    relGroupCreated: 0,
    relGroupReused: 0,
    relPersonCreated: 0,
    relPersonReused: 0,
    relParticipantCreated: 0,
    relParticipantReused: 0,
    participationsCreated: 0,
    participationsReused: 0,
  };

  try {
    await client.query('BEGIN');

    // 1. Asegurar Organización Emisora Festival FDVC
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
      report.entitiesCreated.push({ id: fdvcOrgEntityId, kind: 'organization', slug: fdvcOrgSlug, name: 'Festival Nacional Danza del Vientre Chile' });
    } else {
      fdvcOrgEntityId = resOrg.rows[0].id;
      report.entitiesReused.push({ id: fdvcOrgEntityId, kind: 'organization', slug: fdvcOrgSlug, name: 'Festival Nacional Danza del Vientre Chile' });
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
      report.entitiesCreated.push({ id: eventEntityId, kind: 'event', slug: eventSlug, name: 'Festival Nacional Danza del Vientre Chile 2026' });
    } else {
      eventEntityId = resEv.rows[0].id;
      report.entitiesReused.push({ id: eventEntityId, kind: 'event', slug: eventSlug, name: 'Festival Nacional Danza del Vientre Chile 2026' });
    }

    // 3. Crear/Reutilizar Escuelas
    const schoolEntityMap = new Map(); // slug -> entity_id
    for (const s of normalized.schoolsCatalog) {
      let r = await client.query('SELECT id FROM entities WHERE slug = $1', [s.slug]);
      let orgId;
      if (r.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
           VALUES ('organization', $1, $2, 'Chile', 'Santiago', 'verified', true, true)
           RETURNING id`,
          [s.name, s.slug]
        );
        orgId = ins.rows[0].id;
        await client.query(
          `INSERT INTO organizations (entity_id, organization_type)
           VALUES ($1, $2)`,
          [orgId, s.type]
        );
        report.entitiesCreated.push({ id: orgId, kind: 'organization', slug: s.slug, name: s.name });
        report.schoolsCreated.push({ id: orgId, slug: s.slug, name: s.name });
      } else {
        orgId = r.rows[0].id;
        report.entitiesReused.push({ id: orgId, kind: 'organization', slug: s.slug, name: s.name });
        report.schoolsReused.push({ id: orgId, slug: s.slug, name: s.name });
      }
      schoolEntityMap.set(s.slug, orgId);
    }

    // 4. Crear/Reutilizar Grupos
    const groupEntityMap = new Map(); // slug -> entity_id
    for (const g of normalized.groupsCatalog) {
      let r = await client.query('SELECT id FROM entities WHERE slug = $1', [g.slug]);
      let groupId;
      if (r.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
           VALUES ('organization', $1, $2, 'Chile', 'Santiago', 'verified', true, true)
           RETURNING id`,
          [g.name, g.slug]
        );
        groupId = ins.rows[0].id;
        await client.query(
          `INSERT INTO organizations (entity_id, organization_type)
           VALUES ($1, $2)`,
          [groupId, g.type]
        );
        report.entitiesCreated.push({ id: groupId, kind: 'organization (group)', slug: g.slug, name: g.name });
        report.groupsCreated.push({ id: groupId, slug: g.slug, name: g.name, school: g.associatedSchoolName });
      } else {
        groupId = r.rows[0].id;
        report.entitiesReused.push({ id: groupId, kind: 'organization (group)', slug: g.slug, name: g.name });
        report.groupsReused.push({ id: groupId, slug: g.slug, name: g.name, school: g.associatedSchoolName });
      }
      groupEntityMap.set(g.slug, groupId);
    }

    // 5. Crear/Reutilizar Personas
    const personEntityMap = new Map(); // key -> entity_id
    for (const p of normalized.peopleCatalog) {
      let r = await client.query('SELECT id FROM entities WHERE slug = $1', [p.slug]);
      let personId;
      if (r.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO entities (kind, display_name, slug, country, city, status, is_public, active)
           VALUES ('person', $1, $2, 'Chile', 'Santiago', 'verified', true, true)
           RETURNING id`,
          [p.displayName, p.slug]
        );
        personId = ins.rows[0].id;
        await client.query(
          `INSERT INTO people (entity_id, artistic_name, legal_name, main_role)
           VALUES ($1, $2, $3, $4)`,
          [personId, p.artisticName, p.legalName, p.mainRole]
        );
        report.entitiesCreated.push({ id: personId, kind: 'person', slug: p.slug, name: p.displayName });
        report.peopleCreated.push({ id: personId, slug: p.slug, name: p.displayName, artistic: p.artisticName });
      } else {
        personId = r.rows[0].id;
        report.entitiesReused.push({ id: personId, kind: 'person', slug: p.slug, name: p.displayName });
        report.peopleReused.push({ id: personId, slug: p.slug, name: p.displayName, artistic: p.artisticName });
      }
      personEntityMap.set(p.key, personId);
    }

    // 6. Relaciones Grupo -> Escuela
    for (const r of normalized.groupSchoolRelationships) {
      const fromId = groupEntityMap.get(r.groupSlug);
      const toId = schoolEntityMap.get(r.schoolSlug);
      if (fromId && toId && fromId !== toId) {
        const ins = await client.query(
          `INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status, notes)
           VALUES ($1, $2, $3, $4, 'active', $5)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [fromId, toId, r.type, eventEntityId, r.notes]
        );
        if (ins.rows.length > 0) report.relGroupCreated++;
        else report.relGroupReused++;
      }
    }

    // 7. Relaciones Persona -> Escuela
    for (const r of normalized.personSchoolRelationships) {
      const fromId = personEntityMap.get(r.personKey);
      const toId = schoolEntityMap.get(r.schoolSlug);
      if (fromId && toId && fromId !== toId) {
        const ins = await client.query(
          `INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status, notes)
           VALUES ($1, $2, $3, $4, 'active', $5)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [fromId, toId, r.type, eventEntityId, r.notes]
        );
        if (ins.rows.length > 0) report.relPersonCreated++;
        else report.relPersonReused++;
      }
    }

    // 8. Participaciones en el Evento
    for (const p of normalized.participations) {
      const subjectId = p.subjectKind === 'person'
        ? personEntityMap.get(p.subjectKey)
        : groupEntityMap.get(p.subjectKey);

      if (subjectId) {
        // Relación participant_of
        const insRel = await client.query(
          `INSERT INTO relationships (from_entity_id, to_entity_id, relationship_type, context_event_id, status, notes)
           VALUES ($1, $2, 'participant_of', $2, 'active', $3)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [subjectId, eventEntityId, p.notes]
        );
        if (insRel.rows.length > 0) report.relParticipantCreated++;
        else report.relParticipantReused++;

        // Registro de Participación
        const insPart = await client.query(
          `INSERT INTO participations (subject_entity_id, event_id, state)
           VALUES ($1, $2, 'registered')
           ON CONFLICT (subject_entity_id, event_id) DO NOTHING
           RETURNING id`,
          [subjectId, eventEntityId]
        );
        if (insPart.rows.length > 0) report.participationsCreated++;
        else report.participationsReused++;
      }
    }

    await client.query('COMMIT');
    console.log('\n🎉 Transacción completada con éxito en PostgreSQL (COMMIT efectuado).\n');

    console.log('================================================================');
    console.log('  📊 REPORTE POST-IMPORT — RESULTADOS REALES EN POSTGRESQL');
    console.log('================================================================');
    console.log(`  • Entidades Creadas        : ${report.entitiesCreated.length}`);
    console.log(`  • Entidades Reutilizadas   : ${report.entitiesReused.length}`);
    console.log(`  • Personas Creadas         : ${report.peopleCreated.length} (Reutilizadas: ${report.peopleReused.length})`);
    console.log(`  • Escuelas Creadas         : ${report.schoolsCreated.length} (Reutilizadas: ${report.schoolsReused.length})`);
    console.log(`  • Grupos/Ballets Creados   : ${report.groupsCreated.length} (Reutilizadas: ${report.groupsReused.length})`);
    console.log(`  • Relaciones Creadas       : ${report.relGroupCreated + report.relPersonCreated + report.relParticipantCreated} (Reutilizadas: ${report.relGroupReused + report.relPersonReused + report.relParticipantReused})`);
    console.log(`    - Grupo → Escuela        : ${report.relGroupCreated} creadas, ${report.relGroupReused} reutilizadas`);
    console.log(`    - Persona → Escuela      : ${report.relPersonCreated} creadas, ${report.relPersonReused} reutilizadas`);
    console.log(`    - Participant_of Evento  : ${report.relParticipantCreated} creadas, ${report.relParticipantReused} reutilizadas`);
    console.log(`  • Participaciones Creadas  : ${report.participationsCreated} (Reutilizadas: ${report.participationsReused})`);

    console.log('\n----------------------------------------------------------------');
    console.log('  🔍 UUIDS DE ENTIDADES PRINCIPALES VERIFICADAS');
    console.log('----------------------------------------------------------------');
    console.log(`  1. Evento FDVC 2026        : ${eventEntityId}`);
    console.log(`  2. Org FDVC (Festival)     : ${fdvcOrgEntityId}`);
    console.log(`  3. Priscilla Bellydancer   : ${personEntityMap.get('priscilla-bellydancer')}`);
    console.log(`  4. Tribu Raks El Hob (Org) : ${schoolEntityMap.get('tribu-raks-el-hob')}`);
    console.log(`  5. Tribu Raks El Hob (Grp) : ${groupEntityMap.get('tribu-raks-el-hob-grupo')}`);
    console.log(`  6. María Soledad Lazo / Mah: ${personEntityMap.get('maria-soledad-lazo')}`);
    console.log(`  7. Mahaila May y al. (Esc) : ${schoolEntityMap.get('mahaila-may-y-alumnas')}`);
    console.log(`  8. Mahaila May y al. (Grp) : ${groupEntityMap.get('grupo-mahaila-may-y-alumnas')}`);
    console.log(`  9. Mabel Casandra Parra    : ${personEntityMap.get('mabel-casandra-parra-albarran')}`);
    console.log(` 10. Escuela Casandra        : ${schoolEntityMap.get('escuela-casandra')}`);
    console.log(` 11. Grupo Escuela Casandra  : ${groupEntityMap.get('grupo-escuela-casandra')}`);
    console.log(` 12. Farida Warda            : ${personEntityMap.get('farida-warda')}`);
    console.log(` 13. Academia Farida Warda   : ${schoolEntityMap.get('academia-farida-warda')}`);
    console.log(` 14. Ballet Arwam al Shams   : ${groupEntityMap.get('ballet-arwam-al-shams')}`);
    console.log(` 15. Ballet Alsabalal        : ${groupEntityMap.get('ballet-alsabalal')}`);
    console.log(` 16. Shazadi                 : ${personEntityMap.get('shazadi')}`);
    console.log(` 17. Estudio Shazadi         : ${schoolEntityMap.get('estudio-shazadi-fitness-integrado')}`);
    console.log(` 18. Cristina Acevedo        : ${personEntityMap.get('cristina-acevedo')}`);
    console.log(` 19. Habibi Danza            : ${schoolEntityMap.get('habibi-danza-cajon-del-maipo')}`);
    console.log(` 20. Ballet Habibi           : ${groupEntityMap.get('ballet-habibi')}`);
    console.log('================================================================\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR durante la ejecución en BD:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('import-fdvc2026-pilot.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
