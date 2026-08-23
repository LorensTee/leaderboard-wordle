// NC3/bundle secrecy proof — run AFTER `bun run build`.
// 1. The public valid-guesses artifact may be present in the client bundle.
// 2. Any word in the private answer pool (scripts/seed/*.txt) must be ABSENT
//    from the whole build output (client + server) — the pool is server/DB-only.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BUILD_DIR = resolve('.svelte-kit/cloudflare');
const SEED_DIR = resolve('scripts/seed');
if (!existsSync(BUILD_DIR)) {
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

const files = walk(BUILD_DIR);
const hits: string[] = [];
for (const file of files) {
	const content = readFileSync(file, 'utf8');
	for (const word of poolWords) {
		if (content.includes(word)) hits.push(`${word} → ${file}`);
	}
	// Fold/import-regression guards: secret literals that must never survive
	// into build output — DEV_SECRET is dead code under the NODE_ENV fold,
	// and the generation-only dummy is a top-level literal (not foldable) that
	// would become the effective signing secret if auth.generate.ts were ever
	// imported by app code (it is CLI-only; a scan failure means a regression).
	for (const literal of ['dev-only-secret-change-me', 'cli-generation-only-secret']) {
		if (content.includes(literal)) {
			hits.push(`secret literal (${literal}) → ${file}`);
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