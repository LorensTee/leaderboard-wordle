import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { patchWorker } from './scripts/patch-worker-scheduled';

/** Phase-3 cron wiring (plan §7.3/D8): after every production build, emit the
 * `scheduled` export on the adapter-generated worker (which only exports
 * `fetch` — the adapter has no entrypoint option). Registered AFTER the
 * sveltekit plugin so closeBundle runs after the adapter has written
 * `_worker.js`; `vite preview` (E2E) does not load `_worker.js` and never
 * fires crons, so the hook only affects real builds.
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