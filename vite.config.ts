import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
		})
	]
});