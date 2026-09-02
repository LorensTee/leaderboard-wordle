// Phase-5 S2 (F3) — single source of truth for the Content-Security-Policy
// contract shared by BOTH response surfaces (plan §G/H):
//   - pages: SvelteKit `csp` options in vite.config.ts (hash mode — Kit
//     augments script-src with hashes for its own inline bootstrap scripts);
//   - API: the Hono contentSecurityPolicyHeaders middleware (security-headers.ts).
//
// The pre-paint theme script in src/app.html is static and known at build
// time → allowed by its exact pinned sha256 (NG17; the pin test in
// tests/unit/csp.test.ts fails loudly if app.html drifts). The hash below is
// a literal — no fs access at runtime (Workers constraint): compute it with
// the reproduction snippet in the pin test's failure message.
export const PREPAINT_SCRIPT_SHA256 = 'sha256-PBIDO3zx1vdOnPTvDJ3MOJX3bs7JGBpzpivzIRpKx3I=';

/** Env toggle: `CSP_REPORT_ONLY=1` → report-only headers (dev ladder, plan §G.1). */
export const CSP_REPORT_ONLY_ENV = 'CSP_REPORT_ONLY';

/**
 * Shared directive record (production shape). `upgrade-insecure-requests`
 * and the dev-only websocket origins are applied by buildCspDirectives.
 */
const BASE_DIRECTIVES = {
	'default-src': ['self'],
	// Pre-paint script allowed by its exact hash (plus Kit's own hashes on
	// the page surface in hash mode).
	'script-src': ['self', PREPAINT_SCRIPT_SHA256],
	// style-src 'unsafe-inline' REMOVED (plan §G.2 "prefer strict"): no
	// legitimate runtime <style> injection in the production build (styles
	// are bundled; Svelte transitions mutate element.style programmatically,
	// which CSP does not block). Only the pre-existing `style="display:
	// contents"` attribute in app.html needs inline styles → scoped to
	// style-src-attr (single attribute, minimal surface — triage recorded in
	// the contradictions log; the e2e console-clean gate is the proof).
	'style-src': ['self'],
	'style-src-attr': ['unsafe-inline'],
	'img-src': ['self', 'data:'],
	'font-src': ['self'],
	'connect-src': ['self'],
	'frame-ancestors': ['none'],
	'base-uri': ['self'],
	'form-action': ['self'],
	'object-src': ['none'],
	'frame-src': ['none']
} as const;

export type CspDirectiveRecord = Partial<Record<string, readonly string[] | boolean>>;

/**
 * Builds the directive record for the given mode.
 * - dev (report-only): connect-src gains the Vite HMR websocket origins.
 * - production (enforced): upgrade-insecure-requests (harmless on Workers
 *   HTTPS; plan §G.2 — production only).
 */
export function buildCspDirectives(opts: { dev?: boolean } = {}): CspDirectiveRecord {
	const directives: CspDirectiveRecord = { ...BASE_DIRECTIVES };
	if (opts.dev) {
		directives['connect-src'] = ['self', 'ws://localhost:*', 'ws://127.0.0.1:*'];
	} else {
		directives['upgrade-insecure-requests'] = true;
	}
	return directives;
}

/**
 * Serializes the directive record into a Content-Security-Policy header
 * value. Mirrors SvelteKit's own serializer (kit/src/runtime/server/page/
 * csp.js): keyword sources from the quoted set get single quotes, crypto
 * hashes (nonce-/shaNNN-) and URLs stay bare.
 */
const QUOTED_SOURCES = new Set([
	'self',
	'unsafe-eval',
	'unsafe-hashes',
	'unsafe-inline',
	'none',
	'strict-dynamic',
	'report-sample',
	'wasm-unsafe-eval',
	'script'
]);
const CRYPTO_SOURCE = /^(nonce|sha\d\d\d)-/;

function serializeSource(source: string): string {
	if (QUOTED_SOURCES.has(source)) return `'${source}'`;
	if (CRYPTO_SOURCE.test(source)) return source;
	return source;
}

export function serializeCsp(directives: CspDirectiveRecord): string {
	return Object.entries(directives)
		.map(([name, value]) => {
			if (value === true) return name;
			if (Array.isArray(value)) {
				return value.length > 0
					? `${name} ${value.map((v) => serializeSource(String(v))).join(' ')}`
					: name;
			}
			return `${name} ${serializeSource(String(value))}`;
		})
		.join('; ');
}

/** Whether report-only mode is on (dev ladder, plan §G.1). */
export function isCspReportOnly(env?: Record<string, unknown> | null): boolean {
	if (env && env[CSP_REPORT_ONLY_ENV] === '1') return true;
	// vite dev runs the SSR app in-process; the toggle then arrives as an
	// environment variable rather than a worker binding.
	if (typeof process !== 'undefined') return process.env[CSP_REPORT_ONLY_ENV] === '1';
	return false;
}

/** The production CSP header value (used by the unit tests + Hono middleware). */
export function productionCspValue(): string {
	return serializeCsp(buildCspDirectives());
}