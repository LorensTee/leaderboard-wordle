// Phase-6 S3 — admin answer search integration matrix (P6-2/P6-3/P6-14)
// against live Postgres/Neon (skipped locally without DATABASE_URL — same
// conditional as the other integration suites). Fixture discipline: seeded
// dictionary rows only; "today" is never involved (search is date-agnostic).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { AppError } from '../../src/server/lib/errors';
import { createAdminPuzzleService } from '../../src/server/admin/service';
import { closeDb, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('admin answer search (P6-2/P6-3/P6-14)', () => {
	let db: Db;
	let admin: ReturnType<typeof createAdminPuzzleService>;

	beforeAll(async () => {
		db = await createIntegrationDb();
	});

	beforeEach(async () => {
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
		admin = createAdminPuzzleService(db);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	async function seedAnswer(word: string): Promise<string> {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word, normalizedWord: word })
			.returning();
		return answer.id;
	}

	async function seedPuzzle(puzzleDate: string, word: string): Promise<void> {
		const answerId = await seedAnswer(word);
		await db.insert(schema.dailyPuzzles).values({
			puzzleDate,
			answerId,
			hintLetter: word[0].toUpperCase(),
			status: 'FINALIZED',
			expiresAt: new Date('2099-12-31T00:00:00Z')
		});
	}

	const words = (response: Awaited<ReturnType<typeof admin.searchAnswers>>) =>
		response.results.map((r) => r.word);

	it('ranks exact > prefix > substring, alphabetical within a tier', async () => {
		// 'ab' is the exact match; aback/abase are prefix matches; clabber/scab
		// contain 'ab' mid-word (substring only).
		await seedAnswer('ab');
		await seedAnswer('aback');
		await seedAnswer('abase');
		await seedAnswer('clabber');
		await seedAnswer('scab');
		const res = await admin.searchAnswers('ab', 20);
		expect(words(res)).toEqual(['ab', 'aback', 'abase', 'clabber', 'scab']);
	});

	it('prefix tier: starts-with words sort before pure-substring matches', async () => {
		await seedAnswer('river');
		await seedAnswer('riverbank'); // prefix (starts with 'rive')
		await seedAnswer('driver'); // substring only
		const res = await admin.searchAnswers('rive', 20);
		expect(words(res)).toEqual(['river', 'riverbank', 'driver']);
	});

	it('returns usedOn for answers already referenced by a puzzle, null otherwise', async () => {
		await seedAnswer('light'); // contains 'l', not scheduled → usedOn null
		await seedPuzzle('2026-09-10', 'below'); // contains 'l', scheduled → usedOn set
		await seedAnswer('about'); // no 'l' → must NOT appear in results
		const res = await admin.searchAnswers('l', 20);
		const below = res.results.find((r) => r.word === 'below');
		const light = res.results.find((r) => r.word === 'light');
		expect(below?.usedOn).toBe('2026-09-10');
		expect(light?.usedOn).toBeNull();
		expect(res.results.some((r) => r.word === 'about')).toBe(false);
		// Scheduling rows remain untouched by a search (read-only — I-A10 discipline).
		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles`)
		).rows as { n: number }[];
		expect(n).toBe(1);
	});

	it('total is the pre-limit match count and is not truncated by LIMIT', async () => {
		for (const word of ['aback', 'abaft', 'abase', 'abash', 'abate', 'abide', 'abled']) {
			await seedAnswer(word);
		}
		const res = await admin.searchAnswers('ab', 3);
		expect(res.results).toHaveLength(3);
		expect(res.total).toBe(7);
	});

	it('never returns more than the requested limit even for a broad query', async () => {
		for (const word of ['aaa', 'aab', 'aac', 'aad', 'aae', 'aaf', 'aag', 'aah']) {
			await seedAnswer(word);
		}
		for (const limit of [1, 5, 50]) {
			const res = await admin.searchAnswers('a', limit);
			expect(res.results.length).toBeLessThanOrEqual(limit);
			expect(res.total).toBe(8);
		}
	});

	it('treats % and _ literally (LIKE-escaping; no wildcard injection)', async () => {
		// Not real answer words — probe rows proving the ESCAPE semantics.
		await seedAnswer('100%');
		await seedAnswer('a_b');
		await seedAnswer('aXb');
		const res = await admin.searchAnswers('a_b', 20);
		expect(words(res)).toEqual(['a_b']);
		const r2 = await admin.searchAnswers('100%', 20);
		expect(words(r2)).toEqual(['100%']);
	});

	it('normalizes case/whitespace and returns the canonical dictionary word', async () => {
		await seedAnswer('about');
		await seedAnswer('above');
		const res = await admin.searchAnswers('  ABO ', 20);
		expect(words(res)).toEqual(['about', 'above']);
		expect(res.results[0].word).toBe('about');
	});

	it('no match → empty results with total 0 (success response, not an error)', async () => {
		await seedAnswer('about');
		const res = await admin.searchAnswers('zzzzzz', 20);
		expect(res).toEqual({ results: [], total: 0 });
	});

	it('rejects invalid params at the service seam (400 BAD_REQUEST)', async () => {
		await expect(admin.searchAnswers('', 20)).rejects.toMatchObject({ status: 400 });
		await expect(admin.searchAnswers('   ', 20)).rejects.toMatchObject({ status: 400 });
		await expect(admin.searchAnswers('about', 0)).rejects.toMatchObject({ status: 400 });
		await expect(admin.searchAnswers('about', 51)).rejects.toMatchObject({ status: 400 });
		const caught = (await admin.searchAnswers('about', 0).catch((e) => e)) as AppError;
		expect(caught).toBeInstanceOf(AppError);
		expect(caught.code).toBe('BAD_REQUEST');
	});
});