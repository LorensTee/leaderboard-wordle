// Phase-5 S2 (F3) — CSP contract pins (plan §G).
//   - pre-paint script hash pin: the constant in csp.ts must equal the
//     sha256 of the EXACT bytes of the inline script in src/app.html —
//     adding/reformatting a single character fails loudly WITH the
//     recomputed value in the message (NG17);
//   - directive shape: production vs dev delimitation (ws origins in dev,
//     upgrade-insecure-requests in production), serialization order.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	buildCspDirectives,
	PREPAINT_SCRIPT_SHA256,
	serializeCsp
} from '../../src/server/middleware/csp';

function recomputePrePaintHash(): string {
	const html = readFileSync(new URL('../../src/app.html', import.meta.url), 'utf8');
	const match = html.match(/<script>([\s\S]*?)<\/script>/);
	if (!match) throw new Error('app.html must contain exactly one inline script (pre-paint)');
	return 'sha256-' + createHash('sha256').update(match[1]).digest('base64');
}

describe('CSP pre-paint hash pin (NG17)', () => {
	it('the pinned hash matches the exact bytes of the app.html inline script', () => {
		const recomputed = recomputePrePaintHash();
		expect(
			PREPAINT_SCRIPT_SHA256,
			`pre-paint script changed — recomputed hash for src/app.html is: ${recomputed}. ` +
				'Update PREPAINT_SCRIPT_SHA256 in src/server/middleware/csp.ts if the change is intentional.'
		).toBe(recomputed);
	});
});

describe('CSP directive builder', () => {
	it('production shape: plan §G.2 directives, upgrade-insecure-requests, no ws origins', () => {
		const value = serializeCsp(buildCspDirectives());
		expect(value).toContain(`default-src 'self'`);
		expect(value).toContain(`script-src 'self' ${PREPAINT_SCRIPT_SHA256}`);
		expect(value).toContain(`style-src 'self'`);
		expect(value).toContain(`style-src-attr 'unsafe-inline'`);
		expect(value).not.toContain(`style-src 'self' 'unsafe-inline'`);
		expect(value).toContain(`img-src 'self' data:`);
		expect(value).toContain(`font-src 'self'`);
		expect(value).toContain(`connect-src 'self'`);
		expect(value).toContain(`frame-ancestors 'none'`);
		expect(value).toContain(`base-uri 'self'`);
		expect(value).toContain(`form-action 'self'`);
		expect(value).toContain(`object-src 'none'`);
		expect(value).toContain(`frame-src 'none'`);
		expect(value).toContain('upgrade-insecure-requests');
		expect(value).not.toContain('ws://localhost');
	});

	it('dev shape: Vite HMR websocket origins in connect-src, no upgrade-insecure-requests', () => {
		const value = serializeCsp(buildCspDirectives({ dev: true }));
		expect(value).toContain(`connect-src 'self' ws://localhost:* ws://127.0.0.1:*`);
		expect(value).not.toContain('upgrade-insecure-requests');
	});

	it('serialization produces a valid single header value (semicolon-joined)', () => {
		const value = serializeCsp(buildCspDirectives());
		expect(value.split('; ').length).toBe(Object.keys(buildCspDirectives()).length);
	});
});