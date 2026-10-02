import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

function loadEnv() {
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

async function main() {
  loadEnv();
  let dbUrl = process.env.DATABASE_URL;
  if (dbUrl.includes('culturago-postgres')) {
    try {
      const dns = await import('node:dns/promises');
      await dns.lookup('culturago-postgres');
    } catch {
      dbUrl = dbUrl.replace('@culturago-postgres:', '@172.20.0.2:').replace('@culturago-postgres/', '@172.20.0.2/');
    }
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log('================================================================');
  console.log('  🔍 VERIFICACIÓN DIRECTA DE LOS 7 PUNTOS EN POSTGRESQL');
  console.log('================================================================');

  // Punto 1: Priscilla Bellydancer
  const priscillaRes = await client.query(`
    SELECT e.id, e.display_name, e.slug, p.artistic_name, p.main_role
    FROM entities e
    JOIN people p ON p.entity_id = e.id
    WHERE e.slug = 'priscilla-bellydancer'
  `);
  console.log('\n--- 1. Priscilla Bellydancer ---');
  console.log('Personas encontradas:', priscillaRes.rows.length);
  console.log(priscillaRes.rows[0]);

  const priscillaRels = await client.query(`
    SELECT r.relationship_type, r.notes, to_e.display_name as to_name, to_e.slug as to_slug
    FROM relationships r
    JOIN entities to_e ON to_e.id = r.to_entity_id
    WHERE r.from_entity_id = $1
  `, [priscillaRes.rows[0].id]);
  console.log('Relaciones de Priscilla:');
  console.log(priscillaRels.rows);

  const priscillaParts = await client.query(`
    SELECT p.state, e.name as event_name, rel.notes
    FROM participations p
    JOIN events e ON e.entity_id = p.event_id
    LEFT JOIN relationships rel ON rel.from_entity_id = p.subject_entity_id AND rel.to_entity_id = p.event_id
    WHERE p.subject_entity_id = $1
  `, [priscillaRes.rows[0].id]);
  console.log('Participaciones de Priscilla (Solista):', priscillaParts.rows);

  // Punto 2: Tribu Raks El Hob
  console.log('\n--- 2. Tribu Raks El Hob (Org vs Grupo) ---');
  const tribuOrg = await client.query(`SELECT id, display_name, slug, kind FROM entities WHERE slug = 'tribu-raks-el-hob'`);
  const tribuGrp = await client.query(`SELECT id, display_name, slug, kind FROM entities WHERE slug = 'tribu-raks-el-hob-grupo'`);
  console.log('Organización:', tribuOrg.rows[0]);
  console.log('Grupo       :', tribuGrp.rows[0]);
  console.log('¿UUIDs diferentes?:', tribuOrg.rows[0].id !== tribuGrp.rows[0].id);

  const tribuGrpRels = await client.query(`
    SELECT r.relationship_type, to_e.display_name as to_name, to_e.slug as to_slug
    FROM relationships r
    JOIN entities to_e ON to_e.id = r.to_entity_id
    WHERE r.from_entity_id = $1
  `, [tribuGrp.rows[0].id]);
  console.log('Relaciones del Grupo Tribu Raks El Hob:', tribuGrpRels.rows);

  // Punto 3: María Soledad Lazo / Mahaila
  console.log('\n--- 3. María Soledad Lazo / Mahaila ---');
  const mahailaPerson = await client.query(`
    SELECT e.id, e.display_name, e.slug, p.artistic_name, p.legal_name
    FROM entities e
    JOIN people p ON p.entity_id = e.id
    WHERE e.slug = 'maria-soledad-lazo'
  `);
  const mahailaSchool = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'mahaila-may-y-alumnas'`);
  const mahailaGroup = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'grupo-mahaila-may-y-alumnas'`);
  console.log('Persona :', mahailaPerson.rows[0]);
  console.log('Escuela :', mahailaSchool.rows[0]);
  console.log('Grupo   :', mahailaGroup.rows[0]);

  const mahailaRels = await client.query(`
    SELECT r.relationship_type, to_e.display_name as to_name, to_e.slug as to_slug
    FROM relationships r
    JOIN entities to_e ON to_e.id = r.to_entity_id
    WHERE r.from_entity_id = $1
  `, [mahailaGroup.rows[0].id]);
  console.log('Relaciones del Grupo Mahaila:', mahailaRels.rows);

  // Punto 4: Escuela Casandra
  console.log('\n--- 4. Escuela Casandra ---');
  const casandraPerson = await client.query(`
    SELECT e.id, e.display_name, p.artistic_name, p.legal_name
    FROM entities e JOIN people p ON p.entity_id = e.id
    WHERE e.slug = 'mabel-casandra-parra-albarran'
  `);
  const casandraSchool = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'escuela-casandra'`);
  const casandraGroup = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'grupo-escuela-casandra'`);
  console.log('Persona :', casandraPerson.rows[0]);
  console.log('Escuela :', casandraSchool.rows[0]);
  console.log('Grupo   :', casandraGroup.rows[0]);

  const casandraPersonParts = await client.query(`
    SELECT p.state, rel.notes FROM participations p
    LEFT JOIN relationships rel ON rel.from_entity_id = p.subject_entity_id AND rel.to_entity_id = p.event_id
    WHERE p.subject_entity_id = $1
  `, [casandraPerson.rows[0].id]);
  console.log('Participación Solista Mabel Casandra (Pres 12):', casandraPersonParts.rows);

  const casandraGroupParts = await client.query(`
    SELECT p.state, rel.notes FROM participations p
    LEFT JOIN relationships rel ON rel.from_entity_id = p.subject_entity_id AND rel.to_entity_id = p.event_id
    WHERE p.subject_entity_id = $1
  `, [casandraGroup.rows[0].id]);
  console.log('Participación Grupal Grupo Escuela Casandra (Pres 13):', casandraGroupParts.rows);

  // Punto 5: Academia Farida Warda
  console.log('\n--- 5. Academia Farida Warda ---');
  const faridaPerson = await client.query(`
    SELECT e.id, e.display_name, p.artistic_name FROM entities e
    JOIN people p ON p.entity_id = e.id WHERE e.slug = 'farida-warda'
  `);
  const faridaSchool = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'academia-farida-warda'`);
  const faridaGroups = await client.query(`
    SELECT g.id, g.display_name, g.slug, r.relationship_type, to_e.display_name as school_name
    FROM entities g
    JOIN relationships r ON r.from_entity_id = g.id
    JOIN entities to_e ON to_e.id = r.to_entity_id
    WHERE to_e.slug = 'academia-farida-warda'
  `);
  console.log('Persona :', faridaPerson.rows[0]);
  console.log('Escuela :', faridaSchool.rows[0]);
  console.log('Grupos asociados a Academia Farida Warda:', faridaGroups.rows);

  // Punto 6: Estudio Shazadi Fitness Integrado
  console.log('\n--- 6. Estudio Shazadi Fitness Integrado ---');
  const shazadiPerson = await client.query(`
    SELECT e.id, e.display_name, p.artistic_name, p.legal_name FROM entities e
    JOIN people p ON p.entity_id = e.id WHERE e.slug = 'shazadi'
  `);
  const shazadiSchool = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'estudio-shazadi-fitness-integrado'`);
  const shazadiGroups = await client.query(`
    SELECT g.id, g.display_name, g.slug
    FROM entities g
    JOIN relationships r ON r.from_entity_id = g.id
    WHERE r.to_entity_id = $1 AND r.relationship_type = 'member_of'
  `, [shazadiSchool.rows[0].id]);
  console.log('Persona :', shazadiPerson.rows[0]);
  console.log('Escuela :', shazadiSchool.rows[0]);
  console.log('Grupos asociados (4):', shazadiGroups.rows);

  const shazadiSolista = await client.query(`
    SELECT p.state, rel.notes FROM participations p
    LEFT JOIN relationships rel ON rel.from_entity_id = p.subject_entity_id AND rel.to_entity_id = p.event_id
    WHERE p.subject_entity_id = $1
  `, [shazadiPerson.rows[0].id]);
  console.log('Participación Solista Shazadi (Pres 28):', shazadiSolista.rows);

  // Punto 7: Habibi Danza Cajón del Maipo
  console.log('\n--- 7. Habibi Danza Cajón del Maipo ---');
  const acevedoPerson = await client.query(`
    SELECT e.id, e.display_name FROM entities e
    JOIN people p ON p.entity_id = e.id WHERE e.slug = 'cristina-acevedo'
  `);
  const habibiSchool = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'habibi-danza-cajon-del-maipo'`);
  const habibiGroup = await client.query(`SELECT id, display_name, slug FROM entities WHERE slug = 'ballet-habibi'`);
  console.log('Persona :', acevedoPerson.rows[0]);
  console.log('Escuela :', habibiSchool.rows[0]);
  console.log('Grupo   :', habibiGroup.rows[0]);

  const acevedoRel = await client.query(`
    SELECT r.relationship_type, to_e.display_name as school_name
    FROM relationships r JOIN entities to_e ON to_e.id = r.to_entity_id
    WHERE r.from_entity_id = $1
  `, [acevedoPerson.rows[0].id]);
  console.log('Relación Cristina Acevedo:', acevedoRel.rows);

  const habibiRel = await client.query(`
    SELECT r.relationship_type, to_e.display_name as school_name
    FROM relationships r JOIN entities to_e ON to_e.id = r.to_entity_id
    WHERE r.from_entity_id = $1
  `, [habibiGroup.rows[0].id]);
  console.log('Relación Ballet Habibi:', habibiRel.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
