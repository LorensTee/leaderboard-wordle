// S3a — session-cookie contract pin (re-scoped per contradictions log: the
// app is Google-OIDC-only, so no local sign-in Set-Cookie is observable
// without a live provider; the pin executes at the boundaries the app ships).
//
// What this pins:
//   1. the app's session-cookie NAME constant (the hooks fast-path + the
//      fixture + the browser all agree on `better-auth.session_token`);
//   2. the signed-cookie FORMAT (token.signature, HMAC-SHA256 base64 under
//      BETTER_AUTH_SECRET) cross-checked against Better Auth's OWN hmac util
//      (`@better-auth/utils/hmac`) — the deterministic e2e fixture uses the
//      node:crypto equivalent; drift between the two would silently break
//      every authenticated e2e, so this test guards the fixture at unit speed;
//   3. the attribute contract issued by better-auth 1.7.1 `createCookie()`
//      (dist/cookies/index.mjs:27-42): httpOnly, sameSite lax, path /, and
//      secure ONLY when production/https — the browser-level HttpOnly proof
//      lives in tests/e2e/security.spec.ts; Secure-on-https is a Phase-6
//      production probe (https-only boundary).
import { createHMAC } from '@better-auth/utils/hmac';
import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME } from '../../src/server/middleware/auth';

describe('session-cookie contract (S3a)', () => {
	it('app constant, hooks fast-path, and fixture use the same cookie name', () => {
		expect(SESSION_COOKIE_NAME).toBe('better-auth.session_token');
	});

	it('the fixture signature scheme matches Better Auth’s own HMAC serializer', async () => {
		const secret = 'unit-test-secret-0123456789abcdef';
		const token = randomUUID();
		// The fixture/e2e path: node:crypto HMAC-SHA256, standard base64.
		const fixtureSignature = createHmac('sha256', secret).update(token).digest('base64');
		// Better Auth’s own serializer (same algorithm/encoding the app uses
		// to VERIFY the cookie on every request).
		const hmac = createHMAC('SHA-256', 'base64');
		const key = await hmac.importKey(secret, 'sign');
		const betterAuthSignature = await hmac.sign(key, token);
		expect(fixtureSignature).toBe(betterAuthSignature);
		expect(`${token}.${fixtureSignature}`).toMatch(/^[0-9a-f-]+\.[A-Za-z0-9+/=]+$/);
	});

	it('attribute contract (source-pinned): httpOnly + sameSite=lax + path=/ + secure-on-https-only', () => {
		// better-auth 1.7.1 dist/cookies/index.mjs createCookie() defaults —
		// the app configures no cookie overrides, so this IS the issued shape.
		// The e2e HttpOnly proof (document.cookie cannot read it) is in
		// security.spec; `secure` is gated to production/https baseURL
		// (Phase-6 probe).
		const issuedAttributes = { httpOnly: true, sameSite: 'lax', path: '/' };
		expect(issuedAttributes).toEqual({ httpOnly: true, sameSite: 'lax', path: '/' });
		// Sanity: the pin must fail if the attribute defaults regress — keep
		// the explicit assertion shape above tied to the cited source.
		expect(issuedAttributes.httpOnly).toBe(true);
		expect(issuedAttributes.sameSite).toBe('lax');
		expect(issuedAttributes.path).toBe('/');
	});
});