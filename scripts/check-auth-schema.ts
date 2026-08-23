// Auth-schema parity guard — compares a freshly regenerated Better Auth
// Drizzle schema against the previously committed one after normalizing the
// known TEMPLATE FINGERPRINTS of the unpinned `auth@latest` CLI:
//   - `.defaultNow()` on auth-managed `created_at`/`updated_at` columns
//   - esbuild `/* @__PURE__ */` annotations inside `$onUpdate(...)`
// These vary between fetches of the same CLI version and are semantically
// inert (Better Auth sets timestamps in-app; the DB-side column defaults
// come from the migration). ANY other difference fails the check.
//
// Usage: bun ./scripts/check-auth-schema.ts <before> <after>
//   (wired as `bun run auth:check`; regenerate with `bun run auth:schema`)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
	console.error('usage: bun ./scripts/check-auth-schema.ts <before> <after>');
	process.exit(2);
}

function normalize(src: string): string {
	return src
		.replace(/\.defaultNow\(\)/g, '')
		.replace(/\/\* @__PURE__ \*\//g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

const before = normalize(readFileSync(resolve(beforePath), 'utf8'));
const after = normalize(readFileSync(resolve(afterPath), 'utf8'));

if (before === after) {
	console.log('auth schema parity OK (only fingerprint drift, if any)');
	process.exit(0);
}

const beforeLines = before.split('\n');
const afterLines = after.split('\n');
const max = Math.max(beforeLines.length, afterLines.length);
let shown = 0;
for (let i = 0; i < max && shown < 15; i++) {
	if (beforeLines[i] !== afterLines[i]) {
		console.log(`line ${i + 1}:`);
		console.log(`  before: ${beforeLines[i] ?? '(absent)'}`);
		console.log(`  after:  ${afterLines[i] ?? '(absent)'}`);
		shown++;
	}
}
console.error(
	'AUTH SCHEMA DRIFT: regeneration differs beyond template fingerprints. ' +
		'If this is an intentional auth-config change, commit the regenerated file ' +
		'and run `bun run db:generate` for a matching migration; otherwise investigate.'
);
process.exit(1);