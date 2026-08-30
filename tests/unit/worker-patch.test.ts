// Phase-3 worker-patch contract (U5, plan §11.1/§7.3) — DB-free and
// hermetic (temp dir). Proves with the REAL esbuild bundle of the REAL
// scheduled entry (1) the import + export are appended exactly once,
// (2) re-running skips (idempotent), (3) the settlement chunk contains no
// answer/word-list material (grep against the public valid-guesses artifact
// + answer-domain markers), and (4) the chunk actually exports `scheduled`.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	PATCH_MARKER,
	PATCH_SUFFIX,
	patchWorker,
	patchWorkerFile
} from '../../scripts/patch-worker-scheduled';

// Game/evaluate/word-list modules must never enter the settlement chunk —
// these identifiers would appear verbatim in non-minified esbuild ESM output.
const ANSWER_DOMAIN_MARKERS = [
	'VALID_GUESS_SET',
	'valid-guesses',
	'evaluateGuess',
	'MAX_GUESSES',
	'serializeGameState'
];

describe('worker patch (U5)', () => {
	let dir: string;
	let workerPath: string;
	let chunkPath: string;
	let workerBefore: string;

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'settlement-patch-'));
		workerPath = join(dir, '_worker.js');
		chunkPath = join(dir, '_settlement.js');
		// The adapter-shell shape: only `fetch` exported.
		workerBefore = 'export default { fetch() {} };\n';
		writeFileSync(workerPath, workerBefore);
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('patchWorker bundles the real scheduled entry and appends the import/export exactly once', async () => {
		const outcome = await patchWorker(dir);
		expect(outcome.status).toBe('patched');

		const worker = readFileSync(workerPath, 'utf8');
		expect(worker.startsWith(workerBefore)).toBe(true);
		expect(worker).toContain('import { scheduled } from "./_settlement.js";');
		expect(worker).toContain(PATCH_MARKER);
		// Exactly ONCE — the append must never duplicate on rebuilds.
		expect(worker.split(PATCH_MARKER).length - 1).toBe(1);
		expect(worker.endsWith(PATCH_SUFFIX.trimEnd() + '\n')).toBe(true);
		expect(outcome.chunkPath).toBe(chunkPath);
	});

	it('re-running the patch skips (idempotent) and never duplicates the marker', async () => {
		const outcome = await patchWorker(dir);
		expect(outcome.status).toBe('skipped');
		const worker = readFileSync(workerPath, 'utf8');
		expect(worker.split(PATCH_MARKER).length - 1).toBe(1);
	});

	it('chunk exists, is ESM, and exports `scheduled`', () => {
		const chunk = readFileSync(chunkPath, 'utf8');
		expect(chunk).toMatch(/export\s*\{[^}]*scheduled/);
		expect(chunk).not.toContain('import.meta');
	});

	it('chunk bundle contains NO answer material (game/data layer absent + pool scan)', () => {
		// The settlement graph (puzzle/finalize/manila/db-client) must never
		// drag in the game/evaluate/word-list layer — if it did, the bundled
		// module identifiers would appear verbatim (esbuild ESM output is not
		// minified). `answer_dictionary` (the schema table def) IS expected:
		// finalize imports daily_puzzles/games from the same schema module.
		const chunk = readFileSync(chunkPath, 'utf8');
		for (const marker of ANSWER_DOMAIN_MARKERS) {
			expect(chunk, `game/answer-domain marker ${marker} present in settlement chunk`).not.toContain(
				marker
			);
		}
		// The private answer pool (scripts/seed/*.txt) is gitignored, so this
		// scan is meaningful wherever the pool exists (dev/CI with seeds) and
		// vacuous elsewhere — the complete-build answer gate is verify:bundle.
		const seedDir = join(process.cwd(), 'scripts/seed');
		for (const file of ['private-pool.txt', 'answers.txt']) {
			const path = join(seedDir, file);
			if (!existsSync(path)) continue;
			for (const line of readFileSync(path, 'utf8').split('\n')) {
				const w = line.trim().toLowerCase();
				if (/^[a-z]{5}$/.test(w)) {
					expect(chunk, `answer-pool word ${w} present in settlement chunk`).not.toContain(`"${w}"`);
				}
			}
		}
	});

	it('patchWorkerFile appends/skips on a raw file (unit path)', () => {
		const tmp = join(dir, 'raw-worker.js');
		writeFileSync(tmp, 'export default {};\n');
		expect(patchWorkerFile(tmp)).toBe('patched');
		expect(patchWorkerFile(tmp)).toBe('skipped');
		expect(readFileSync(tmp, 'utf8').split(PATCH_MARKER).length - 1).toBe(1);
	});

	it('patchWorker DEFERS (skipped, reason=deferred) when the worker output is missing — fresh-checkout/client-build-phase regression (CI failure #1)', async () => {
		// vite fires closeBundle once per build environment; the client phase
		// runs BEFORE the adapter writes .svelte-kit/cloudflare/_worker.js.
		// On a fresh checkout the output does not exist yet — the patch must
		// defer, not fail the build (the final phase is authoritative).
		const missing = join(dir, 'no-such-output');
		const outcome = await patchWorker(missing, undefined, undefined, { failIfMissing: false });
		expect(outcome.status).toBe('skipped');
		expect(outcome.reason).toBe('deferred');

		// Direct operator runs still fail loudly without a build output.
		await expect(
			patchWorker(missing, undefined, undefined, { failIfMissing: true })
		).rejects.toThrow(/not found/);
	});
});