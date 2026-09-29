/** Drops and recreates the public schema. Dev/test only. */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL!;
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error('Refusing to reset a non-local database:', url.replace(/:[^:@/]+@/, ':***@'));
  process.exit(1);
}
const sql = postgres(url);
await sql.unsafe('drop schema public cascade; create schema public;');
await sql.end();
console.log('Database reset.');
await import('node:fs/promises').then((fs) => fs.rm('storage', { recursive: true, force: true }));
