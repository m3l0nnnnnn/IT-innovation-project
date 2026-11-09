// Adds the starting KPIs (lib/kpis.ts) if they are missing: npm run db:seed-kpis
// Existing KPIs with the same name are left alone, so managers' threshold changes are kept.
import { db, pool } from './index.js';
import { kpiDefinitions } from './schema.js';
import { DEFAULT_KPIS } from '../lib/kpis.js';

export async function seedDefaultKpis() {
  const rows = await db.insert(kpiDefinitions)
    .values(DEFAULT_KPIS.map((k, i) => ({ ...k, sortOrder: i + 1 })))
    .onConflictDoNothing({ target: kpiDefinitions.name })
    .returning({ id: kpiDefinitions.id });
  return rows.length;
}

// Run directly (not when imported by seed.ts).
if (process.argv[1]?.replaceAll('\\', '/').endsWith('db/seed-kpis.ts')) {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.');
    console.log(`Added ${await seedDefaultKpis()} of ${DEFAULT_KPIS.length} default KPIs (existing ones were kept).`);
  } catch (err) {
    console.error('Seeding KPIs failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
