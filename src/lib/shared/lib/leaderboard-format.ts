// Phase-3 leaderboard display formatting (U3) — display-only, never
// aggregation. Average guesses render at 2 decimal places (P4: provisional
// display decision; ranking always uses the exact numeric value from the
// server). Pure and unit-tested.
export const AVERAGE_GUESSES_DECIMALS = 2;

/**
 * Format the exact numeric average-guesses value for display (e.g. `3.50`).
 * The ranking itself never uses this rounded form (plan §2.2/P4).
 */
export function formatAverageGuesses(value: number): string {
	if (!Number.isFinite(value)) return '0.00';
	return value.toFixed(AVERAGE_GUESSES_DECIMALS);
}