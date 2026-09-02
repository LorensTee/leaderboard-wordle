import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { patchWorker } from './scripts/patch-worker-scheduled.ts';
import {
	buildCspDirectives,
	CSP_REPORT_ONLY_ENV
} from './src/server/middleware/csp';

/** Phase-3 cron wiring (plan §7.3/D8): after every production build, emit the
 * `scheduled` export on the adapter-generated worker (which only exports
 * `fetch` — the adapter has no entrypoint option). Registered AFTER the
 * sveltekit plugin; vite fires closeBundle once per build environment, and
 * the client phase runs BEFORE the adapter writes _worker.js — patchWorker
 * defers (skips) until the final phase, where the adapter output exists.
 * `vite preview` (E2E) does not load `_worker.js` and never fires crons, so
 * the hook only affects real builds. The CI patched-worker assertion guards
 * a silently missed patch.
 */
const patchWorkerOnBuild: Plugin = {
	name: 'patch-worker-scheduled',
	apply: 'build',
	async closeBundle() {
		try {
			await patchWorker();
		} catch (err: unknown) {
			console.error('[patch-worker-scheduled] failed to patch the built worker', err);
			process.exitCode = 1;
		}
	}
};

export default defineConfig({
	plugins: [
		// Tailwind CSS v4 — CSS-first (`@import "tailwindcss"` in src/app.css).
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Cloudflare Workers adapter — see https://svelte.dev/docs/kit/adapter-cloudflare
			adapter: adapter(),

			// Phase-5 S2 (F3) — CSP for page responses (plan §G): hash mode
			// hashes SvelteKit's own inline bootstrap scripts and augments
			// script-src; the pre-paint theme script in app.html is allowed by
			// its pinned sha256 (csp.ts + the unit hash pin). Report-only in
			// dev when CSP_REPORT_ONLY=1 (documented toggle), enforced in
			// build/preview/production — the E2E console-clean gate is the
			// enforcement ladder (plan §G.1/D7).
			csp: (() => {
				// Dev gets the dev-shaped directives (Vite HMR websocket origins
				// in connect-src, no upgrade-insecure-requests) so enforcement
				// works without breaking HMR; the production/preview build is
				// the strict production shape. `CSP_REPORT_ONLY=1` switches to
				// PURE report-only (no enforced header — Kit 2.63 hard-requires
				// report-uri/report-to here; the endpoint intentionally does
				// NOT exist, plan §G.3: reports are read from devtools/e2e
				// console; dev-only 404 noise — recorded S2f).
				const inDev = process.env.NODE_ENV !== 'production';
				if (process.env[CSP_REPORT_ONLY_ENV] === '1') {
					return {
						mode: 'hash' as const,
						reportOnly: {
							...buildCspDirectives({ dev: true }),
							'report-uri': ['/__csp-report__']
						}
					};
				}
				return { mode: 'hash' as const, directives: buildCspDirectives({ dev: inDev }) };
			})(),

			// Kit options passed via the Vite config (kit 2.62+ — svelte.config.js
			// is ignored when options are passed here).
			alias: {
				$server: './src/server'
			}
		}),
		// AFTER sveltekit — closeBundle must run once _worker.js exists.
		patchWorkerOnBuild
	]
});