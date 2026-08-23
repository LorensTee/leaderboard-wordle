// Programmatic migration runner for CI (replaces `drizzle-kit migrate`, which
// exits 1 silently ~140ms after driver selection on GitHub runners — the CLI
// prints no error; this path surfaces any failure with a full stack).
// Local dev can keep using `bun run db:migrate` (drizzle-kit).
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../src/server/db/schema';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is empty');
	process.exit(2);
}

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8_000 });
try {
	await migrate(drizzle(pool, { schema }), {
		migrationsFolder: 'src/server/db/migrations'
	});
	console.log('migrations applied successfully (programmatic)');
} catch (e) {
	console.error('MIGRATE FAILED:', (e as Error).stack ?? (e as Error).message);
	process.exit(1);
} finally {
	await pool.end();
}