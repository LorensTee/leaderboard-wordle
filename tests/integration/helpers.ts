// Integration harness — driver seam.
//
// The B6 integration suites assert PostgreSQL semantics (row locks, READ
// COMMITTED visibility, CHECK constraints) through the app's query surface.
// They run against:
//   - LOCAL_PG=1            → drizzle-orm/node-postgres + pg Pool (local
//                             Postgres; used in dev against a throwaway DB)
//   - otherwise (default)   → the app's real production path:
//                             @neondatabase/serverless Pool +
//                             drizzle-orm/neon-serverless (CI/external gate
//                             against Neon; requires a Neon DATABASE_URL)
//
// The Neon WebSocket transport itself is verified at the B7 external gate.
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from '../../src/server/db/schema';

export type Db = NeonDatabase<typeof schema> & {
	$client: {
		end(): Promise<void>;
		connect(): Promise<{
			query(q: string): Promise<{ rows: unknown[] }>;
			release(): Promise<void>;
		}>;
	};
};

export async function createIntegrationDb(): Promise<Db> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is required for integration tests');

	if (process.env.LOCAL_PG === '1') {
		const { Pool } = await import('pg');
		const { drizzle } = await import('drizzle-orm/node-postgres');
		const pool = new Pool({ connectionString: url });
		return drizzle(pool, { schema }) as unknown as Db;
	}

	const { Pool } = await import('@neondatabase/serverless');
	const { drizzle } = await import('drizzle-orm/neon-serverless');
	const pool = new Pool({ connectionString: url });
	return drizzle(pool, { schema }) as unknown as Db;
}

export async function closeDb(db: Db): Promise<void> {
	await db.$client.end();
}

/**
 * A single dedicated connection from the underlying pool (pg-compatible
 * interface on both drivers). Transactional sequences (BEGIN … COMMIT) must
 * run on ONE connection — drizzle's pooled API may dispatch each statement
 * to a different connection, which would silently break lock semantics.
 */
export async function connectClient(db: Db): Promise<{
	query(q: string): Promise<{ rows: unknown[] }>;
	release(): Promise<void>;
}> {
	const client = await db.$client.connect();
	return {
		query: (q: string) => client.query(q) as Promise<{ rows: unknown[] }>,
		release: () => client.release()
	};
}