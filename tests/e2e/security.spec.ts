// Phase-5 S3 (F8/F9) — Spec §21 security regression net, browser/API level.
// Reuses the deterministic session fixture (tests/e2e/helpers/auth-fixture.ts)
// — real user+session rows + the exact Better Auth signed cookie, no Google
// round-trip. This file does NOT duplicate existing coverage: admin E-A1
// (tab absence, page redirect, 403 matrix) and e2e scenario 12 (UI logout)
// are referenced, not re-implemented. CSP console-clean lives in csp.spec.ts
// (single home, decided in S2).
import { expect, test } from '@playwright/test';
import {
	createAuthenticatedUser,
	e2eAuthAvailable,
	seedTodayPuzzle
} from './helpers/auth-fixture';

const authAvailable = e2eAuthAvailable();
const BASE = 'http://127.0.0.1:4173';

async function addSessionCookie(
	context: import('@playwright/test').BrowserContext,
	cookie: string
): Promise<void> {
	await context.addCookies([
		{
			name: 'better-auth.session_token',
			value: cookie,
			url: BASE,
			// Issued as HttpOnly by Better Auth (1.7.1 createCookie defaults;
			// pinned in tests/unit/security-cookie.test.ts). Injecting it as
			// HttpOnly lets the HttpOnly e2e pin prove BROWSER ENFORCEMENT
			// (document.cookie must not expose it), not cookie injection.
			httpOnly: true
		}
	]);
}

test.describe('security regression (S3)', () => {
	test.describe.configure({ mode: 'serial' });
	test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');

	test('API bypass rejected: unauthenticated protected surfaces → 401 envelope', async ({
		request
	}) => {
		for (const path of [
			'/api/game/current',
			'/api/me',
			'/api/admin/puzzles',
			'/api/leaderboard/today'
		]) {
			const res = await request.get(path);
			expect(res.status(), path).toBe(401);
			const body = await res.json();
			expect(body.error.code, path).toBe('UNAUTHORIZED');
			expect(body.error.requestId, path).toBeTruthy();
		}
	});

	test('cross-user isolation: user A cannot act on user B game, profile, or identity', async ({
		browser
	}) => {
		// B is created FRESH (wipe) and starts a game on the seeded puzzle.
		const b = await createAuthenticatedUser(`b-${Date.now()}@test.dev`, 'B Player', {
			onboarded: true
		});
		await seedTodayPuzzle('crane');
		const bCtx = await browser.newContext();
		await addSessionCookie(bCtx, b.cookie);
		const bReq = bCtx.request;
		const start = await bReq.post('/api/game/start', { headers: { origin: BASE } });
		expect(start.status()).toBe(200);
		const { game } = await start.json();

		// A is created alongside B (no wipe → B's row survives).
		const a = await createAuthenticatedUser(`a-${Date.now()}@test.dev`, 'A Player', {
			onboarded: true,
			fresh: false
		});
		const aCtx = await browser.newContext();
		await addSessionCookie(aCtx, a.cookie);
		const aReq = aCtx.request;

		// A cannot submit a guess on B's game (ownership → 403 FORBIDDEN).
		const guess = await aReq.post(`/api/game/${game.id}/guess`, {
			headers: { origin: BASE, 'content-type': 'application/json' },
			data: JSON.stringify({ word: 'crane' })
		});
		expect(guess.status()).toBe(403);
		expect((await guess.json()).error.code).toBe('FORBIDDEN');

		// A's identity is its own (never B's).
		const meA = await aReq.get('/api/me');
		expect((await meA.json()).user.id).not.toBe(b.userId);

		// A updating its profile does not touch B's.
		const patchA = await aReq.patch('/api/me/profile', {
			headers: { origin: BASE, 'content-type': 'application/json' },
			data: JSON.stringify({ displayName: 'A Renamed' })
		});
		expect(patchA.status()).toBe(200);
		const meB = await bReq.get('/api/me');
		expect((await meB.json()).user.name).toBe('b player');

		// B's game is untouched: still B's, still in progress.
		const currentB = await bReq.get('/api/game/current');
		expect((await currentB.json()).game?.id).toBe(game.id);

		await aCtx.close();
		await bCtx.close();
	});

	test('cross-site mutation rejected: foreign-origin POST/PATCH → 403 CSRF envelope', async ({
		browser
	}) => {
		const victim = await createAuthenticatedUser(`v-${Date.now()}@test.dev`, 'Victim', {
			onboarded: true
		});
		const ctx = await browser.newContext();
		await addSessionCookie(ctx, victim.cookie);
		const req = ctx.request;

		// Attacker origin carrying the victim's session cookie → CSRF gate.
		const evil = await req.patch('/api/me/profile', {
			headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
			data: JSON.stringify({ displayName: 'Hacked' })
		});
		expect(evil.status()).toBe(403);
		expect((await evil.json()).error.code).toBe('CSRF');

		// Control: the SAME mutation from the real origin succeeds (proves the
		// 403 is origin-driven, not a broken endpoint).
		const sameOrigin = await req.patch('/api/me/profile', {
			headers: { origin: BASE, 'content-type': 'application/json' },
			data: JSON.stringify({ displayName: 'Victim Renamed' })
		});
		expect(sameOrigin.status()).toBe(200);

		await ctx.close();
	});

	test('protected pages redirect unauthenticated visitors to the landing page', async ({
		browser
	}) => {
		const ctx = await browser.newContext(); // no session cookie at all
		const page = await ctx.newPage();
		for (const path of ['/play', '/profile', '/leaderboard', '/admin']) {
			await page.goto(path);
			// SvelteKit guard semantics: 307 to the landing page. goto()
			// follows the redirect, so assert the FINAL URL.
			expect(new URL(page.url()).pathname, path).toBe('/');
		}
		await ctx.close();
	});

	test('non-admin: API 403 + page redirect (reference: admin E-A1 covers the full matrix)', async ({
		browser
	}) => {
		const player = await createAuthenticatedUser(`p-${Date.now()}@test.dev`, 'Plain Player', {
			onboarded: true
		});
		const ctx = await browser.newContext();
		await addSessionCookie(ctx, player.cookie);
		const page = await ctx.newPage();

		const res = await ctx.request.get('/api/admin/puzzles');
		expect(res.status()).toBe(403);
		expect((await res.json()).error.code).toBe('FORBIDDEN');

		const denied = await ctx.request.post('/api/admin/puzzles/validate', {
			headers: { origin: BASE, 'content-type': 'application/json' },
			data: JSON.stringify({ word: 'crane' })
		});
		expect(denied.status()).toBe(403);

		// Page level: /admin redirects (role guard). Admin TAB absence + the
		// redirect matrix are pinned by admin.spec E-A1 — not duplicated here.
		await page.goto('/admin');
		expect(new URL(page.url()).pathname).toBe('/');

		await ctx.close();
	});

	test('malformed and oversized bodies → 400/413 NG21 envelopes', async ({
		browser
	}) => {
		// 413 fires PRE-guard (bodyLimit before auth/CSRF — unit-tested too).
		const oversized = await (
			await browser.newContext()
		).request.post('/api/game/start', { data: 'x'.repeat(70 * 1024) });
		expect(oversized.status()).toBe(413);
		expect((await oversized.json()).error.code).toBe('PAYLOAD_TOO_LARGE');

		// A malformed JSON body on an AUTHENTICATED same-origin call → the
		// sanitized 400 BAD_REQUEST envelope (raw parser output never leaks).
		// PATCH /api/me/profile carries a strict JSON body validator (POST
		// /api/game/start has NO body schema, so bad JSON there is never
		// parsed — verified: it returns the puzzle 404 instead).
		const user = await createAuthenticatedUser(`m-${Date.now()}@test.dev`, 'Malformed', {
			onboarded: true,
			fresh: false
		});
		const ctx = await browser.newContext();
		await addSessionCookie(ctx, user.cookie);
		const bad = await ctx.request.patch('/api/me/profile', {
			headers: { origin: BASE, 'content-type': 'application/json' },
			data: '{ definitely not json'
		});
		expect(bad.status()).toBe(400);
		const body = await bad.json();
		expect(body.error.code).toBe('BAD_REQUEST');
		expect(body.error.requestId).toBeTruthy();
		await ctx.close();
	});

	test('sign-out invalidates protected access (API-level; UI covered by scenario 12)', async ({
		browser
	}) => {
		const user = await createAuthenticatedUser(`s-${Date.now()}@test.dev`, 'Signer Outer', {
			onboarded: true,
			fresh: false
		});
		const ctx = await browser.newContext();
		await addSessionCookie(ctx, user.cookie);
		const req = ctx.request;

		expect((await req.get('/api/me')).status()).toBe(200);
		// /api/auth/* is CSRF-excluded from OUR gate; Better Auth's own
		// boundary still wants a same-origin header (its origin check) — the
		// real browser sends one automatically; the API context must be
		// explicit (recorded in the Phase-1 latent-bug decision log).
		const out = await req.post('/api/auth/sign-out', { headers: { origin: BASE } });
		expect(out.status()).toBe(200);
		expect((await out.json()).success).toBe(true);
		// The session row is gone → the same cookie now yields 401.
		expect((await req.get('/api/me')).status()).toBe(401);

		await ctx.close();
	});

	test('session cookie is HttpOnly (browser cannot read it via document.cookie)', async ({
		browser
	}) => {
		const user = await createAuthenticatedUser(`h-${Date.now()}@test.dev`, 'Hidden Cookie', {
			onboarded: true,
			fresh: false
		});
		const ctx = await browser.newContext();
		await addSessionCookie(ctx, user.cookie);
		const page = await ctx.newPage();
		await page.goto('/profile');
		const visible = await page.evaluate(() => document.cookie);
		expect(visible).not.toContain('better-auth.session_token');
		await ctx.close();
	});
});