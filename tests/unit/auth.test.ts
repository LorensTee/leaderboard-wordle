// B7 security-review fix — the session secret must never fall back to a
// published constant in production (session-forgery risk).
import { describe, expect, it } from 'vitest';
import { createAuth } from '../../src/server/auth/auth';

describe('auth secret policy', () => {
	it('uses the provided BETTER_AUTH_SECRET', () => {
		const auth = createAuth({ DATABASE_URL: 'postgresql://x', BETTER_AUTH_SECRET: 'a-real-secret' });
		expect(auth).toBeDefined();
	});

	it('uses the dev fallback outside production (tools/tests)', () => {
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';
		try {
			const auth = createAuth({ DATABASE_URL: 'postgresql://x' });
			expect(auth).toBeDefined();
		} finally {
			process.env.NODE_ENV = prev;
		}
	});

	it('refuses to start without BETTER_AUTH_SECRET when NODE_ENV is unset (deployed Worker condition)', () => {
		// Workers never set NODE_ENV (nodejs_compat) — production is the
		// default; the dev fallback must NOT be selected in that condition.
		const prev = process.env.NODE_ENV;
		delete process.env.NODE_ENV;
		try {
			expect(() => createAuth({ DATABASE_URL: 'postgresql://x' })).toThrow(/BETTER_AUTH_SECRET/);
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});

	it('refuses to start without BETTER_AUTH_SECRET in production', () => {
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			expect(() => createAuth({ DATABASE_URL: 'postgresql://x' })).toThrow(/BETTER_AUTH_SECRET/);
		} finally {
			process.env.NODE_ENV = prev;
		}
	});
});