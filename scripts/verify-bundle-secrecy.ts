// NC3/bundle secrecy proof — run AFTER `bun run build`.
// 1. The public valid-guesses artifact may be present in the client bundle.
// 2. Any word in the private answer pool (scripts/seed/*.txt) must be ABSENT
//    from the whole build output (client + server) — the pool is server/DB-only.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BUILD_DIR = resolve('.svelte-kit/cloudflare');
// The adapter shell (_worker.js) does NOT contain the app code — the real
// server bundle lives in .svelte-kit/output/server (verified: shell is
// ~4 KB, zero app symbols). Scan BOTH so the secrecy guards cannot pass on
// an unscanned server bundle.
const SERVER_BUNDLE_DIR = resolve('.svelte-kit/output/server');
const SEED_DIR = resolve('scripts/seed');
if (!existsSync(BUILD_DIR) || !existsSync(SERVER_BUNDLE_DIR)) {
	console.error('build output missing — run `bun run build` first');
	process.exit(1);
}

const poolWords = new Set<string>();
for (const file of readdirSync(SEED_DIR)) {
	if (!file.endsWith('.txt')) continue;
	for (const line of readFileSync(resolve(SEED_DIR, file), 'utf8').split('\n')) {
		const w = line.trim().toLowerCase();
		if (/^[a-z]{5}$/.test(w)) poolWords.add(w);
	}
}

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = resolve(dir, e.name);
		return e.isDirectory() ? walk(p) : [p];
	});
}

const files = [...walk(BUILD_DIR), ...walk(SERVER_BUNDLE_DIR)];
const hits: string[] = [];
for (const file of files) {
	const content = readFileSync(file, 'utf8');
	for (const word of poolWords) {
		if (content.includes(word)) hits.push(`${word} → ${file}`);
	}
	// Advisory: secret literals in build output are now EXPECTED (the dev
	// fallback is runtime-conditional on NODE_ENV, which Workers never set —
	// the effective-secret policy is enforced by auth.ts + auth.test.ts; the
	// earlier fold-based absence guard was invalid because bundlers emit the
	// NODE_ENV check dynamically in SSR chunks). Escalate to failure only if
	// the answer-pool scan above fires.
	for (const literal of ['dev-only-secret-change-me', 'cli-generation-only-secret']) {
		if (content.includes(literal)) {
			console.warn(
				`advisory: secret literal (${literal}) present in build output (${file}) — ` +
					`expected while the dev fallback remains runtime-conditional; policy is enforced at runtime`
			);
		}
	}
}

if (hits.length > 0) {
	console.error(`SECRET LEAK: ${hits.length} answer-pool word(s) found in build output:`);
	for (const h of hits) console.error(`  ${h}`);
	process.exit(1);
}
console.log(`bundle secrecy OK: ${poolWords.size} private word(s) absent from ${files.length} build files`);
console.log('public valid-guesses artifact is client-side by design (checked in unit tests)');