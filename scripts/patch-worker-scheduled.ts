// Phase-3 cron wiring (plan §7.3, D8) — deterministic post-build patch.
//
// @sveltejs/adapter-cloudflare has NO entrypoint option and its fixed worker
// template exports only `fetch` (verified against the installed 7.2.9), so a
// `scheduled` export cannot be authored in SvelteKit source. This script:
//
//   1. builds the settlement cron entry (src/server/puzzle/scheduled-entry.ts)
//      with esbuild into `.svelte-kit/cloudflare/_settlement.js` —
//      `platform: 'browser'`, `format: 'esm'`, `bundle: true`,
//      `external: ['cloudflare:workers']` (plan §7.3);
//   2. appends to `.svelte-kit/cloudflare/_worker.js`:
//      `import { scheduled } from "./_settlement.js"; export { scheduled };`
//      — idempotent (skipped when the marker is already present).
//
// wrangler bundles the `main` module graph at deploy/dev time, so the sibling
// chunk ships as part of the worker script, not as a static asset. The chunk
// contains no answer material (asserted by tests) and no secrets — it imports
// only puzzle/game services and manila helpers.
import { build, type BuildOptions } from 'esbuild';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SETTLEMENT_ENTRY = resolve('src/server/puzzle/scheduled-entry.ts');
export const WORKER_RELATIVE = '.svelte-kit/cloudflare/_worker.js';
export const CHUNK_RELATIVE = '.svelte-kit/cloudflare/_settlement.js';
export const PATCH_MARKER = 'export { scheduled }';
export const PATCH_SUFFIX = `\nimport { scheduled } from "./_settlement.js";\nexport { scheduled };\n`;

export type PatchOutcome = { status: 'patched' | 'skipped'; workerPath: string; chunkPath: string };

/**
 * Bundle the settlement cron entry into the worker output directory.
 * `onBuild` is a test seam (defaults to esbuild's real `build`).
 */
export async function buildSettlementChunk(
	outfile: string,
	entryPoint: string = SETTLEMENT_ENTRY,
	onBuild: (options: BuildOptions) => Promise<unknown> = build
): Promise<string> {
	const options: BuildOptions = {
		entryPoints: [entryPoint],
		outfile,
		bundle: true,
		platform: 'browser',
		format: 'esm',
		// The entry never imports cloudflare:workers (its platform types are
		// structural, compile-time only) — extern it anyway so a future
		// platform import stays a runtime binding rather than a bundle error.
		external: ['cloudflare:workers'],
		logLevel: 'warning'
	};
	await onBuild(options);
	return outfile;
}

/**
 * Append the `scheduled` import/export to the built worker — exactly once.
 * Returns 'skipped' when the marker is already present (idempotent).
 */
export function patchWorkerFile(workerPath: string): 'patched' | 'skipped' {
	const content = readFileSync(workerPath, 'utf8');
	if (content.includes(PATCH_MARKER)) return 'skipped';
	writeFileSync(workerPath, content + PATCH_SUFFIX);
	return 'patched';
}

/** Full patch: chunk build + worker append. Throws when the build output is missing. */
export async function patchWorker(
	workerDir = resolve('.svelte-kit/cloudflare'),
	entryPoint: string = SETTLEMENT_ENTRY,
	onBuild?: (options: BuildOptions) => Promise<unknown>
): Promise<PatchOutcome> {
	if (!existsSync(workerDir)) {
		throw new Error(
			`[patch-worker-scheduled] ${relative(resolve('.'), workerDir)} not found — run this after \`bun run build\``
		);
	}
	const workerPath = join(workerDir, '_worker.js');
	if (!existsSync(workerPath)) {
		throw new Error(
			`[patch-worker-scheduled] ${relative(resolve('.'), workerPath)} not found — run this after \`bun run build\``
		);
	}
	const chunkPath = join(workerDir, '_settlement.js');
	await buildSettlementChunk(chunkPath, entryPoint, onBuild);
	const status = patchWorkerFile(workerPath);
	console.log(
		`[patch-worker-scheduled] ${status === 'patched' ? 'patched' : 'already patched'} ` +
			`${relative(resolve('.'), workerPath)} (chunk: ${relative(resolve('.'), chunkPath)})`
	);
	return { status, workerPath, chunkPath };
}

// Direct execution (`bun ./scripts/patch-worker-scheduled.ts`): runs the full
// patch. When imported (vite.config.ts hook, unit tests) the script path is
// not the process entry — no side effects. (import.meta.main is a Bun-only
// API; this check is portable across Bun and Node.)
const isDirectRun =
	typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
	void patchWorker().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}