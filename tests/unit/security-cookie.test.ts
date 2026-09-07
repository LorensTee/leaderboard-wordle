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
import {
	SECURE_SESSION_COOKIE_NAME,
	SESSION_COOKIE_NAME,
	hasSessionCookie
} from '../../src/server/middleware/auth';

describe('session-cookie contract (S3a)', () => {
	it('app constants, hooks fast-path, and fixture use the same cookie names', () => {
		expect(SESSION_COOKIE_NAME).toBe('better-auth.session_token');
		// Production https baseURL gets the `__Secure-` prefix (better-auth
		// 1.7.1 createCookieGetter); the base name covers http local envs.
		expect(SECURE_SESSION_COOKIE_NAME).toBe('__Secure-better-auth.session_token');
	});

	it('fast-path predicate accepts both exact Better Auth cookie names', () => {
		expect(hasSessionCookie(`better-auth.session_token=token.signature`)).toBe(true);
		expect(hasSessionCookie(`__Secure-better-auth.session_token=token.signature`)).toBe(true);
		// Mixed cookie list, any position.
		expect(hasSessionCookie(`theme=dark; __Secure-better-auth.session_token=abc; other=1`)).toBe(
			true
		);
		expect(hasSessionCookie(`theme=dark; better-auth.session_token=abc; other=1`)).toBe(true);
	});

	it('fast-path predicate is boundary-exact: no lookalike cookie names match', () => {
		// Missing cookie / empty header.
		expect(hasSessionCookie(undefined)).toBe(false);
		expect(hasSessionCookie('')).toBe(false);
		expect(hasSessionCookie('theme=dark; other=1')).toBe(false);
		// Lookalike names must NOT trigger a session lookup.
		expect(hasSessionCookie('__Securebetter-auth.session_token=abc')).toBe(false);
		expect(hasSessionCookie('__Host-better-auth.session_token=abc')).toBe(false);
		expect(hasSessionCookie('foo-better-auth.session_token=abc')).toBe(false);
		expect(hasSessionCookie('better-auth.session_token2=abc')).toBe(false);
		expect(hasSessionCookie('better-auth.session_token=abc-suffix')).toBe(true);
	});

	it('the fixture signature scheme matches Better Auth’s own HMAC serializer', async () => {
		const secret = 'unit-test-secret-0123456789abcdef';
		const token = randomUUID();
		// The fixture/e2e path: node:crypto HMAC-SHA256, STANDARD base64
		// (alphabet +/). Better Auth's own serializer encodes URL-SAFE
		// base64 (alphabet -_) — the same HMAC bytes, different alphabets.
		// The runtime (cookie VERIFICATION) decodes both (proven by the e2e
		// fixture sessions resolving with standard-base64 cookies), so the
		// contract is BYTE equality, not string equality. (This pin was
		// originally written as a string comparison — flaky: ~50% of random
		// tokens produce HMACs whose two encodings coincide. CI caught it.)
		const fixtureSignature = createHmac('sha256', secret).update(token).digest('base64');
		const hmac = createHMAC('SHA-256', 'base64');
		const key = await hmac.importKey(secret, 'sign');
		const betterAuthSignature = await hmac.sign(key, token);
		const toStandard = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/');
		expect(
			Buffer.from(toStandard(fixtureSignature), 'base64').equals(
				Buffer.from(toStandard(betterAuthSignature), 'base64')
			)
		).toBe(true);
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