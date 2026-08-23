// Application tables (Architecture-v3 §374–491). Better Auth tables
// (user/account/session/verification) come from auth-schema.generated.ts,
// produced by the Better Auth CLI from src/server/auth/auth.ts — never
// hand-author a competing auth schema (v19 change #3).
import { sql } from 'drizzle-orm';
import {
	check,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema.generated';

export const puzzleStatus = pgEnum('puzzle_status', ['SCHEDULED', 'ACTIVE', 'FINALIZED']);
export const gameStatus = pgEnum('game_status', ['ACTIVE', 'COMPLETED', 'FAILED', 'FORFEITED']);

// Server-only approved pool of future answer candidates. Must never reach the
// client bundle or the public repository (Architecture §413, §697).
export const answerDictionary = pgTable(
	'answer_dictionary',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		word: text('word').notNull(),
		normalizedWord: text('normalized_word').notNull()
	},
	(t) => [
		uniqueIndex('answer_dictionary_word_uidx').on(t.word),
		uniqueIndex('answer_dictionary_normalized_word_uidx').on(t.normalizedWord)
	]
);

// One puzzle per Asia/Manila calendar date (NG1/NG3).
export const dailyPuzzles = pgTable(
	'daily_puzzles',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		// ISO 'YYYY-MM-DD' string — avoids JS Date timezone pitfalls at the
		// Manila daily boundary (NG3: DATE type).
		puzzleDate: date('puzzle_date', { mode: 'string' }).notNull(),
		// UNIQUE — one use only; an approved answer can never be scheduled twice.
		answerId: uuid('answer_id')
			.notNull()
			.references(() => answerDictionary.id),
		// Validated at scheduling time (single A-Z present in the answer).
		// DB CHECK enforces shape only (NG2 — a CHECK cannot reference another row).
		hintLetter: text('hint_letter').notNull(),
		status: puzzleStatus('status').notNull().default('SCHEDULED'),
		// Mutability state, not lifecycle status (Architecture §442).
		lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
		// (puzzle_date + 1) AT TIME ZONE 'Asia/Manila' — computed at schedule time (NG1).
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		// Frozen at finalization, COMPLETED games only (NG24 + §427–428).
		averageCompletionTimeMs: integer('average_completion_time_ms'),
		nonCompletionPenaltyMs: integer('non_completion_penalty_ms'),
		finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		uniqueIndex('daily_puzzles_puzzle_date_uidx').on(t.puzzleDate),
		uniqueIndex('daily_puzzles_answer_id_uidx').on(t.answerId),
		// NG3 candidate index (confirm against query plans).
		index('daily_puzzles_status_date_idx').on(t.status, t.puzzleDate),
		check('hint_letter_shape', sql`char_length(${t.hintLetter}) = 1 AND ${t.hintLetter} ~ '^[A-Z]$'`)
	]
);

// MISSED is derived (no row), never stored (Architecture §478).
export const games = pgTable(
	'games',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		puzzleId: uuid('puzzle_id')
			.notNull()
			.references(() => dailyPuzzles.id),
		status: gameStatus('status').notNull().default('ACTIVE'),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
		// Stored once at successful completion; authoritative for COMPLETED only (NG24).
		completionTimeMs: integer('completion_time_ms'),
		guessCount: integer('guess_count').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		// At most one game per user per puzzle.
		uniqueIndex('games_user_puzzle_uidx').on(t.userId, t.puzzleId),
		// NG3 candidate index (confirm against query plans).
		index('games_puzzle_status_idx').on(t.puzzleId, t.status)
	]
);

export const guesses = pgTable(
	'guesses',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		gameId: uuid('game_id')
			.notNull()
			.references(() => games.id),
		guessNumber: integer('guess_number').notNull(),
		word: text('word').notNull(),
		// green/yellow/gray result for historical reconstruction (Architecture §487).
		feedback: jsonb('feedback').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		// Sequential, no duplicates (Architecture §468).
		uniqueIndex('guesses_game_number_uidx').on(t.gameId, t.guessNumber)
	]
);

export * from './auth-schema.generated';