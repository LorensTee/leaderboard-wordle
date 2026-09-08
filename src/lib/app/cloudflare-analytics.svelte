<script lang="ts">
	// Cloudflare Web Analytics — manual beacon (J-A1).
	//
	// Rendered through <svelte:head> from the ROOT layout, so the beacon is
	// present on every HTML page exactly once per document. SvelteKit only
	// rewrites the body on client-side navigation — the <head> (and this
	// script element) stays in place, so the module script is fetched and
	// executed on the initial page load only and never re-executes on SPA
	// navigation.
	//
	// `import.meta.env.PROD` is statically replaced by Vite at build time, so
	// the beacon ships ONLY in production builds (`vite build` / `vite
	// preview` / Workers) — local `vite dev` sessions never fire real-user
	// analytics and never pollute the production baseline.
	//
	// CSP contract (csp.ts, Phase-5 S2): the beacon is allowed by adding
	//   script-src  https://static.cloudflareinsights.com
	//   connect-src https://cloudflareinsights.com
	// to the SHARED directive builder (page + API stay in sync). The token
	// below lives ONLY in the data-cf-beacon attribute — it is NOT part of
	// the CSP (Cloudflare Web Analytics manual-install guidance).
	//
	// The token is public by design (it ships in every page's HTML for the
	// browser to read) — same exposure as the snippet Cloudflare provides.
	const BEACON_TOKEN = '1875099085ec473cb10b4b00cf08d5d7';
</script>

<svelte:head>
	{#if import.meta.env.PROD}
		<!-- Cloudflare Web Analytics -->
		<script
			type="module"
			src="https://static.cloudflareinsights.com/beacon.min.js"
			data-cf-beacon={`{"token": "${BEACON_TOKEN}"}`}
		></script>
		<!-- End Cloudflare Web Analytics -->
	{/if}
</svelte:head>
