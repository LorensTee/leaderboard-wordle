// Generation-only config for `bun run auth:schema` (the Better Auth CLI
// requires an `auth` variable or default export). This file is NEVER
// imported by application code, so it cannot leak into the Worker bundle;
// the runtime path is getAuth() in auth.ts with real Worker bindings.
//
// BETTER_AUTH_SECRET is pinned to an explicit dummy so generation is
// independent of the invoking shell's NODE_ENV (auth.ts fails hard in
// production without a real secret — that policy must not affect tooling).
import { createAuth } from './auth';
import { INERT_DB_URL } from './auth';

export const auth = createAuth({
	DATABASE_URL: process.env.DATABASE_URL ?? INERT_DB_URL,
	BETTER_AUTH_SECRET: 'cli-generation-only-secret'
});