// Phase-5 S1k — rate-limit namespace config gate (deploy.yml Gate 3 +
// tests/unit/rate-limit-config.test.ts share this single implementation so
// the gate and its tests cannot drift).
//
// Cloudflare schema (verified 2026-09-08 against the CURRENT docs,
// https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
// AND the installed wrangler 4.125 config-schema.json): `namespace_id` is
// "a string containing a positive integer that uniquely defines this rate
// limiting namespace within your Cloudflare account" — the docs' own example
// is "1001"; it is NOT a UUID (an earlier gate draft wrongly required UUIDs;
// corrected — contradictions log S1k-C). `simple.limit` is the number of
// allowed requests; `simple.period` is 10 or 60. Bindings sharing a
// namespace_id share counters, even across Workers on the same account — so
// sharing is only consistent when the declared limits are identical.
//
// This project's namespace ids ARE 1001–1005 (1001–1004 pre-date the
// leaderboard work and are the account's working ids; 1005 is the leader-
// board read class — operator decision S1k-D). There is NO reserved/
// placeholder policy: the gate enforces only Cloudflare's schema. The ids
// must stay unique within the Cloudflare account (not used by any other
// rate-limit binding on the account).
//
// Usage: bun ./scripts/check-rate-limit-config.ts [path-to-wrangler.toml]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Every per-class binding the runtime guard (rateLimitBindingGuard) requires. */
export const REQUIRED_BINDING_NAMES = [
	'AUTH_RATE_LIMITER',
	'GAME_RATE_LIMITER',
	'ME_RATE_LIMITER',
	'ADMIN_RATE_LIMITER',
	'LEADERBOARD_RATE_LIMITER'
] as const;

/**
 * Cloudflare format: a string containing a positive integer (docs example:
 * "1001"). Canonical form (no leading zeros, no sign, no fraction) so that
 * "1001" and "01001" cannot silently become two different namespaces.
 */
export const NAMESPACE_ID_PATTERN = /^[1-9][0-9]*$/;

export type RateLimitBlock = {
	name?: string;
	namespaceId?: string;
	limit?: number;
	period?: number;
};

/**
 * Minimal TOML extraction for the `[[ratelimits]]` blocks in wrangler.toml.
 * Deliberately regex-based (no dependency): the repo's config keeps each
 * block's three keys on single lines; anything outside `[[ratelimits]]`
 * blocks is ignored. Missing keys stay `undefined` and are reported.
 */
export function parseRateLimitBlocks(toml: string): RateLimitBlock[] {
	const blocks: RateLimitBlock[] = [];
	let current: RateLimitBlock | null = null;
	for (const raw of toml.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === '[[ratelimits]]') {
			current = {};
			blocks.push(current);
			continue;
		}
		// Any other `key = value` section header closes the ratelimits block.
		if (line.startsWith('[')) {
			current = null;
			continue;
		}
		if (!current) continue;
		const name = line.match(/^name\s*=\s*"([^"]+)"/);
		if (name) {
			current.name = name[1];
			continue;
		}
		const ns = line.match(/^namespace_id\s*=\s*"([^"]+)"/);
		if (ns) {
			current.namespaceId = ns[1];
			continue;
		}
		const simple = line.match(/^simple\s*=\s*\{\s*limit\s*=\s*(\d+)\s*,\s*period\s*=\s*(\d+)\s*\}/);
		if (simple) {
			current.limit = Number(simple[1]);
			current.period = Number(simple[2]);
		}
	}
	return blocks;
}

/** Validates the wrangler.toml rate-limit config; returns human-readable issues. */
export function validateRateLimitConfig(toml: string): string[] {
	const issues: string[] = [];
	const blocks = parseRateLimitBlocks(toml);
	const required = REQUIRED_BINDING_NAMES;

	if (blocks.length !== required.length) {
		issues.push(
			`expected exactly ${required.length} [[ratelimits]] blocks, found ${blocks.length} — every per-class binding must be declared`
		);
	}

	const declaredNames = new Set(blocks.map((b) => b.name).filter((n): n is string => Boolean(n)));
	for (const name of required) {
		if (!declaredNames.has(name)) {
			issues.push(`required rate-limit binding "${name}" is not declared in wrangler.toml`);
		}
	}

	blocks.forEach((block, index) => {
		const label = block.name ? `"${block.name}"` : `#${index + 1}`;
		if (!block.name) {
			issues.push(`[[ratelimits]] block #${index + 1} is missing \`name\``);
		}
		if (block.namespaceId === undefined) {
			issues.push(`[[ratelimits]] ${label} is missing \`namespace_id\``);
		} else if (!NAMESPACE_ID_PATTERN.test(block.namespaceId)) {
			issues.push(
				`[[ratelimits]] ${label}: namespace_id "${block.namespaceId}" is not a positive integer — Cloudflare schema requires a string containing a positive integer (docs example "1001")`
			);
		}
		if (block.limit === undefined || !Number.isInteger(block.limit) || block.limit < 1) {
			issues.push(
				`[[ratelimits]] ${label}: \`simple.limit\` must be a positive integer (found ${String(block.limit)})`
			);
		}
		if (block.period !== 10 && block.period !== 60) {
			issues.push(
				`[[ratelimits]] ${label}: \`simple.period\` must be 10 or 60 per wrangler 4.125 (found ${String(block.period)})`
			);
		}
	});

	// Cloudflare semantics: bindings sharing a namespace_id share counters
	// (even across Workers on the same account) — sharing is only consistent
	// when the declared limits are identical. Per-class PROPOSED limits are
	// distinct, so the shared-namespace form requires uniform limits (S1b).
	const byNamespace = new Map<string, RateLimitBlock[]>();
	for (const block of blocks) {
		if (block.namespaceId === undefined) continue;
		const group = byNamespace.get(block.namespaceId) ?? [];
		group.push(block);
		byNamespace.set(block.namespaceId, group);
	}
	for (const [id, group] of byNamespace) {
		if (group.length < 2) continue;
		const limits = new Set(group.map((b) => b.limit));
		if (limits.size > 1) {
			issues.push(
				`bindings ${group
					.map((b) => `"${b.name ?? '?'}"`)
					.join(', ')} share namespace_id "${id}" but declare different simple.limit values — shared namespaces share counters (Cloudflare semantics); use a distinct id per class or identical limits (S1b)`
			);
		}
	}

	return issues;
}

if (import.meta.main) {
	const tomlPath = resolve(process.argv[2] ?? 'wrangler.toml');
	const toml = readFileSync(tomlPath, 'utf8');
	const issues = validateRateLimitConfig(toml);
	for (const issue of issues) {
		console.error(`::error::${issue}`);
	}
	if (issues.length > 0) {
		console.error(
			'[check-rate-limit-config] FAILED — fix the namespace/limit configuration to match Cloudflare\u2019s schema (positive-integer namespace ids, period 10|60, all five bindings)'
		);
		process.exit(1);
	}
	console.log(
		`[check-rate-limit-config] OK — ${parseRateLimitBlocks(toml).length} [[ratelimits]] namespaces: positive-integer ids, consistent limits, all required bindings declared`
	);
	process.exit(0);
}