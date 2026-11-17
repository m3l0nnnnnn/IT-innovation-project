// Seeds Town Councils and ~13 months of FICTIONAL feedback cases shaped like the sample import file: npm run db:seed
// Re-running replaces all feedback cases (default KPIs are only added if missing). The same SEED always produces the
// same generated cases (dates are relative to today); the sample file's own cases keep their dates.
// The cases themselves are built in seed-data.ts.
import { sql } from 'drizzle-orm';
import { db, pool } from './index.js';
import { townCouncils, cases } from './schema.js';
import { seedDefaultKpis } from './seed-kpis.js';
import { buildSeedCases, loadSampleCases, SEED_COUNCILS } from './seed-data.js';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.');
  const now = new Date();

  await db.insert(townCouncils).values(SEED_COUNCILS.map(c => ({ name: c.name }))).onConflictDoNothing();
  const councilRows = await db.select().from(townCouncils);

  const sample = await loadSampleCases(councilRows, now);
  const rows = buildSeedCases(new Map(councilRows.map(r => [r.name, r.id])), now, sample.cases);

  await db.transaction(async tx => {
    await tx.execute(sql`truncate table ${cases}`);
    for (let i = 0; i < rows.length; i += 500) await tx.insert(cases).values(rows.slice(i, i + 500));
  });

  const open = rows.filter(r => r.status === 'Open').length;
  const duplicates = rows.filter(r => r.duplicateOfId).length;
  console.log(`Seeded ${SEED_COUNCILS.length} town councils and ${rows.length} feedback cases (${open} open, ${duplicates} duplicates).`);
  console.log(`Included ${sample.cases.length} cases from the sample file; skipped ${sample.skipped.length} rows that fail the import checks:`);
  for (const s of sample.skipped) console.log(`  row ${s.rowNumber}: ${s.messages.join(' ')}`);
  console.log(`Added ${await seedDefaultKpis()} default KPIs (existing KPIs and their settings were kept).`);
}

try {
  await main();
} catch (err) {
  console.error('Seeding failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
