// Shared time formatting for the display-only timer (Architecture §Timer
// authority: the browser timer is display-only; server timestamps are
// authoritative). Pure and unit-tested.
export const MILLIS_PER_SECOND = 1000;
export const MILLIS_PER_MINUTE = 60 * MILLIS_PER_SECOND;
export const MILLIS_PER_HOUR = 60 * MILLIS_PER_MINUTE;

/**
 * Format milliseconds as `m:ss` (or `h:mm:ss` beyond an hour).
 * Negative/NaN input → '0:00' (defensive; display-only).
 */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '0:00';
	const totalSeconds = Math.floor(ms / MILLIS_PER_SECOND);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
	const ss = String(seconds).padStart(2, '0');
	return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Elapsed wall time between a server timestamp (ISO string) and now.
 * Display-only — game validity never depends on this value.
 */
export function elapsedSince(isoStart: string, now: number = Date.now()): number {
	const start = new Date(isoStart).getTime();
	if (!Number.isFinite(start)) return 0;
	return Math.max(0, now - start);
}