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

export type PatchOutcome = {
	status: 'patched' | 'skipped';
	workerPath: string;
	chunkPath: string;
	/** Present when the patch was deferred because the worker output isn't ready yet. */
	reason?: 'deferred';
};

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

/** Full patch: chunk build + worker append. */
export async function patchWorker(
	workerDir = resolve('.svelte-kit/cloudflare'),
	entryPoint: string = SETTLEMENT_ENTRY,
	onBuild?: (options: BuildOptions) => Promise<unknown>,
	opts: { failIfMissing?: boolean } = {}
): Promise<PatchOutcome> {
	const workerPath = join(workerDir, '_worker.js');
	if (!existsSync(workerDir) || !existsSync(workerPath)) {
		// DEFER (not fail): vite runs closeBundle once per build environment —
		// the client build's closeBundle fires BEFORE the adapter has written
		// .svelte-kit/cloudflare/_worker.js, and the final (server) build phase
		// is the authoritative patch point. The CI patched-worker assertion
		// (`grep -q "export { scheduled }" …/_worker.js`) is the safety net
		// against a silently missed patch. Direct operator runs pass
		// failIfMissing so a manual patch without a build still fails loudly.
		if (opts.failIfMissing) {
			throw new Error(
				`[patch-worker-scheduled] ${relative(resolve('.'), workerDir)} not found — run this after \`bun run build\``
			);
		}
		console.warn(
			`[patch-worker-scheduled] worker output not present yet (${relative(resolve('.'), workerDir)}) — ` +
				'deferring to the final build phase'
		);
		return { status: 'skipped', workerPath, chunkPath: join(workerDir, '_settlement.js'), reason: 'deferred' };
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
// patch — fails loudly when the build output is missing. When imported
// (vite.config.ts hook, unit tests) the script path is not the process
// entry — no side effects.
const isDirectRun =
	typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
	void patchWorker(undefined, undefined, undefined, { failIfMissing: true }).catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}