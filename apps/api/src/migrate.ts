// Runtime migration entrypoint. Uses drizzle-orm's built-in migrator (not the
// drizzle-kit CLI), so the production image needs only drizzle-orm + pg + the
// compiled SQL in ./drizzle — no drizzle-kit, esbuild, or TS config at runtime.
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { config } from './config';

async function main() {
    const pool = new Pool({ connectionString: config.databaseUrl });
    const db = drizzle(pool);
    // dist/migrate.js -> ../drizzle == apps/api/drizzle (copied into the image)
    await migrate(db, { migrationsFolder: join(__dirname, '..', 'drizzle') });
    await pool.end();
    console.log('migrations applied');
}

main().catch((err) => {
    console.error('migration failed', err);
    process.exit(1);
});
