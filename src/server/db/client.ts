// Neon PostgreSQL client — WebSocket-capable driver for interactive
// transactions (SELECT ... FOR UPDATE). Do NOT replace with the HTTP-only
// `drizzle-orm/neon-http` path (Architecture §343–361).
//
// drizzle-orm 0.45 module note: the WebSocket serverless driver lives at
// `drizzle-orm/neon-serverless`; `drizzle-orm/neon` is the Neon-Auth/RLS
// module (preflight correction, proposed-dependencies.md).
import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export type Db = NeonDatabase<typeof schema> & { $client: Pool };

/**
 * Create the app database client from a Neon WebSocket connection string.
 * Credentials come from the Worker environment / bindings at the platform
 * boundary (B3) or process.env in local dev/tests — never from source.
 */
export function createDb(databaseUrl: string): Db {
	const pool = new Pool({ connectionString: databaseUrl });
	return drizzle(pool, { schema });
}

export async function closeDb(db: Db): Promise<void> {
	await db.$client.end();
}