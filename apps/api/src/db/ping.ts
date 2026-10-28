// Checks the database connection: npm run db:ping
import { pool } from './index.js';

try {
  const { rows } = await pool.query('select current_database() as db, version() as version');
  console.log('Connected to ' + rows[0].db + ': ' + rows[0].version);
} catch (err) {
  console.error('Database connection failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
