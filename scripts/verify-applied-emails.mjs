import pg from 'pg';
import fs from 'node:fs';

const { Client } = pg;

let dbUrl = '';
const envContent = fs.readFileSync('/opt/culturago/.env', 'utf8');
for (const line of envContent.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
  }
}

if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

dbUrl = dbUrl.replace('@culturago-postgres:', '@172.20.0.2:');

const client = new Client({ connectionString: dbUrl });

async function run() {
  await client.connect();

  console.log('--- VERIFICACIÓN ESPECÍFICA (SAMAIRA, NAZLI, MAHAILA) ---');
  const specific = await client.query(`
    SELECT p.presentation_code, e.kind, e.display_name, e.slug, p.registration_email, p.credential_delivery_email
    FROM participations p
    JOIN entities e ON p.subject_entity_id = e.id
    WHERE p.presentation_code IN ('FDVC2026-025', 'FDVC2026-026', 'FDVC2026-027', 'FDVC2026-011')
    ORDER BY p.presentation_code
  `);
  console.table(specific.rows);

  console.log('--- VERIFICACIÓN DE DUPLICADOS EN PRESENTATION_CODE ---');
  const duplicates = await client.query(`
    SELECT presentation_code, count(*)
    FROM participations
    WHERE presentation_code IS NOT NULL
    GROUP BY presentation_code
    HAVING count(*) > 1
  `);
  console.log('Duplicados encontrados:', duplicates.rows.length);

  console.log('--- RECUENTO DE TOTALES PILOTO ---');
  const totals = await client.query(`
    SELECT
      count(*) as total_participations,
      count(presentation_code) as with_code,
      count(registration_email) as with_reg_email,
      count(credential_delivery_email) as with_del_email
    FROM participations
    WHERE presentation_code LIKE 'FDVC2026-%'
  `);
  console.table(totals.rows);

  console.log('--- GUARDRAILS DE CUENTAS / WALLETS / CREDENCIALES ---');
  const accounts = await client.query('SELECT count(*) FROM accounts');
  const passkeys = await client.query('SELECT count(*) FROM passkey_credentials');
  const wallets = await client.query('SELECT count(*) FROM wallets');
  const smartWalletClaims = await client.query('SELECT count(*) FROM smart_wallet_claims');
  const credentials = await client.query('SELECT count(*) FROM credentials');
  const stellarOps = await client.query('SELECT count(*) FROM stellar_operations');

  console.log('Total accounts           :', accounts.rows[0].count);
  console.log('Total passkeys           :', passkeys.rows[0].count);
  console.log('Total wallets            :', wallets.rows[0].count);
  console.log('Total smart_wallet_claims:', smartWalletClaims.rows[0].count);
  console.log('Total credentials        :', credentials.rows[0].count);
  console.log('Total stellar_operations :', stellarOps.rows[0].count);

  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
