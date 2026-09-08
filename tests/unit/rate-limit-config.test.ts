// Phase-5 S1k — deploy-gate config checker (scripts/check-rate-limit-config.ts).
// The SAME implementation runs in deploy.yml Gate 3, so these tests pin the
// production gate against the CURRENT Cloudflare schema (verified
// 2026-09-08): namespace_id is a string containing a POSITIVE INTEGER
// (docs example "1001") — NOT a UUID (S1k-C correction). There is NO
// reserved-placeholder policy (S1k-D): this project's namespace ids ARE
// 1001–1005, so they must pass; malformed ids fail; shared namespace_ids
// are allowed only with identical limits (counter sharing).
import { describe, expect, it } from 'vitest';
import {
	NAMESPACE_ID_PATTERN,
	parseRateLimitBlocks,
	REQUIRED_BINDING_NAMES,
	validateRateLimitConfig
} from '../../scripts/check-rate-limit-config';

const REAL_IDS = {
	AUTH_RATE_LIMITER: '2011',
	GAME_RATE_LIMITER: '2012',
	ME_RATE_LIMITER: '2013',
	ADMIN_RATE_LIMITER: '2014',
	LEADERBOARD_RATE_LIMITER: '2015'
};

/** Faithful shape of the committed wrangler.toml [[ratelimits]] blocks. */
function tomlWith(namespaceIds: Record<string, string>, limits?: Record<string, number>): string {
	const blocks = REQUIRED_BINDING_NAMES.map(
		(name) => `[[ratelimits]]
name = "${name}"
namespace_id = "${namespaceIds[name]}"
simple = { limit = ${limits?.[name] ?? 100}, period = 60 }`
	);
	return `${blocks.join('\n\n')}

# trailing config (must be ignored by the parser)
[assets]
binding = "ASSETS"
directory = ".svelte-kit/cloudflare"

[secrets]
required = ["DATABASE_URL"]
`;
}

describe('check-rate-limit-config (deploy.yml Gate 3)', () => {
	it('the project namespace ids 1001–1005 pass (no reserved-placeholder policy — S1k-D)', () => {
		// 1001–1004 were the working production ids before the leaderboard
		// work; 1005 is the new leaderboard class. All are plain positive
		// integers per the Cloudflare schema, so the gate must accept them.
		const issues = validateRateLimitConfig(
			tomlWith({
				AUTH_RATE_LIMITER: '1001',
				GAME_RATE_LIMITER: '1002',
				ME_RATE_LIMITER: '1003',
				ADMIN_RATE_LIMITER: '1004',
				LEADERBOARD_RATE_LIMITER: '1005'
			})
		);
		expect(issues).toEqual([]);
	});

	it('other positive-integer ids also pass (the docs example "1001" itself is valid format)', () => {
		expect(validateRateLimitConfig(tomlWith(REAL_IDS))).toEqual([]);
		expect(
			validateRateLimitConfig(
				tomlWith({
					AUTH_RATE_LIMITER: '1',
					GAME_RATE_LIMITER: '42',
					ME_RATE_LIMITER: '999999',
					ADMIN_RATE_LIMITER: '314159265358979',
					LEADERBOARD_RATE_LIMITER: '1006'
				})
			)
		).toEqual([]);
	});

	it('malformed namespace_ids fail the Cloudflare format check', () => {
		const malformed = [
			'0', // not positive
			'-5',
			'1.5',
			'01001', // leading zero — canonical integer form required
			'12ab',
			'not-a-uuid',
			'',
			// UUID-shaped values are NOT valid namespace_ids for this binding
			// (they are not integers) — S1k-C correction.
			'11111111-1111-4111-8111-111111111111',
			'00000000-0000-0000-0000-000000000000'
		];
		for (const id of malformed) {
			const issues = validateRateLimitConfig(
				tomlWith({
					AUTH_RATE_LIMITER: id,
					GAME_RATE_LIMITER: REAL_IDS.GAME_RATE_LIMITER,
					ME_RATE_LIMITER: REAL_IDS.ME_RATE_LIMITER,
					ADMIN_RATE_LIMITER: REAL_IDS.ADMIN_RATE_LIMITER,
					LEADERBOARD_RATE_LIMITER: REAL_IDS.LEADERBOARD_RATE_LIMITER
				})
			);
			expect(
				issues.some(
					(issue) =>
						issue.includes(JSON.stringify(id)) ||
						(id === '' && issue.includes('missing `namespace_id`'))
				)
			).toBe(true);
		}
	});

	it('shared namespace_id is allowed only with identical limits (Cloudflare counter-sharing semantics)', () => {
		// Same id, same limit → the S1b shared-namespace form.
		const shared = tomlWith({
			AUTH_RATE_LIMITER: '3001',
			GAME_RATE_LIMITER: '3001',
			ME_RATE_LIMITER: REAL_IDS.ME_RATE_LIMITER,
			ADMIN_RATE_LIMITER: REAL_IDS.ADMIN_RATE_LIMITER,
			LEADERBOARD_RATE_LIMITER: REAL_IDS.LEADERBOARD_RATE_LIMITER
		});
		expect(validateRateLimitConfig(shared)).toEqual([]);
		// Same id, DIFFERENT limits → contradictory (one namespace = one limit).
		const conflicting = tomlWith(
			{
				AUTH_RATE_LIMITER: '3001',
				GAME_RATE_LIMITER: '3001',
				ME_RATE_LIMITER: REAL_IDS.ME_RATE_LIMITER,
				ADMIN_RATE_LIMITER: REAL_IDS.ADMIN_RATE_LIMITER,
				LEADERBOARD_RATE_LIMITER: REAL_IDS.LEADERBOARD_RATE_LIMITER
			},
			{ AUTH_RATE_LIMITER: 10, GAME_RATE_LIMITER: 30 }
		);
		const issues = validateRateLimitConfig(conflicting);
		expect(issues.some((issue) => issue.includes('share namespace_id "3001"'))).toBe(true);
	});

	it('undeclared / missing binding names fail', () => {
		const issues = validateRateLimitConfig(
			tomlWith(REAL_IDS).replace('name = "LEADERBOARD_RATE_LIMITER"', 'name = "BOARD_RATE_LIMITER"')
		);
		expect(issues.some((issue) => issue.includes('LEADERBOARD_RATE_LIMITER'))).toBe(true);
	});

	it('wrong block count fails', () => {
		const issues = validateRateLimitConfig(
			tomlWith(REAL_IDS).replace('[[ratelimits]]\nname = "ADMIN_RATE_LIMITER"', '[assets]')
		);
		expect(issues.some((issue) => issue.includes('expected exactly 5 [[ratelimits]] blocks'))).toBe(
			true
		);
	});

	it('wrangler 4.125 simple schema: period must be 10 or 60, limit positive', () => {
		const base = tomlWith(REAL_IDS);
		expect(
			validateRateLimitConfig(base.replace('limit = 100, period = 60', 'limit = 100, period = 30'))
		).toEqual([expect.stringContaining('must be 10 or 60')]);
		expect(
			validateRateLimitConfig(
				base.replace('simple = { limit = 100, period = 60 }', 'simple = { limit = 0, period = 60 }')
			)
		).toEqual([expect.stringContaining('positive integer')]);
	});

	it('empty / missing config fails', () => {
		const issues = validateRateLimitConfig('');
		expect(issues.some((issue) => issue.includes('expected exactly 5'))).toBe(true);
		expect(issues.some((issue) => issue.includes('AUTH_RATE_LIMITER'))).toBe(true);
	});

	it('parseRateLimitBlocks ignores non-ratelimits sections', () => {
		const blocks = parseRateLimitBlocks(tomlWith(REAL_IDS));
		expect(blocks).toHaveLength(REQUIRED_BINDING_NAMES.length);
		expect(blocks[0]).toEqual({
			name: 'AUTH_RATE_LIMITER',
			namespaceId: REAL_IDS.AUTH_RATE_LIMITER,
			limit: 100,
			period: 60
		});
	});

	it('NAMESPACE_ID_PATTERN matches positive-integer strings only (not UUIDs)', () => {
		expect(NAMESPACE_ID_PATTERN.test('1001')).toBe(true); // the docs' own example
		expect(NAMESPACE_ID_PATTERN.test('1')).toBe(true);
		expect(NAMESPACE_ID_PATTERN.test('42')).toBe(true);
		expect(NAMESPACE_ID_PATTERN.test('0')).toBe(false);
		expect(NAMESPACE_ID_PATTERN.test('0001')).toBe(false);
		expect(NAMESPACE_ID_PATTERN.test('1001.0')).toBe(false);
		expect(NAMESPACE_ID_PATTERN.test('11111111-1111-4111-8111-111111111111')).toBe(false);
		expect(NAMESPACE_ID_PATTERN.test('1 001')).toBe(false);
	});
});