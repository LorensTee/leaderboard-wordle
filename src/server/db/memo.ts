// Per-deployment memoized database handle (one Pool per DATABASE_URL).
// Worker env is stable per isolate, so re-creating the client on every
// request would leak connection pools; the memo mirrors the getAuth cache
// pattern (src/server/auth/auth.ts).
import { AppError, ERROR_CODES } from '../lib/errors';
import { createDb, type Db } from './client';

const cache = new Map<string, Db>();

export function getDb(env: { DATABASE_URL?: string }): Db {
	const url = env.DATABASE_URL;
	if (!url) {
		throw new AppError(ERROR_CODES.INTERNAL, 'DATABASE_URL is not configured', 500);
	}
	let db = cache.get(url);
	if (!db) {
		db = createDb(url);
		cache.set(url, db);
	}
	return db;
}