// Phase-2 theme provider (D5 / NG5): binary light|dark, `localStorage['theme']`,
// system (`prefers-color-scheme`) as the default, applied before first paint
// by the inline head script in src/app.html (data-theme on <html>), and
// driven by Tailwind v4's `@custom-variant dark` in src/app.css.
// No SSR/DB involvement; theme is pure client state (local Svelte), never
// TanStack Query.
import { writable } from 'svelte/store';

export const THEME_STORAGE_KEY = 'theme';

export type Theme = 'light' | 'dark';

export function isTheme(value: unknown): value is Theme {
	return value === 'light' || value === 'dark';
}

/** The explicitly stored theme, or null when absent/unparseable. */
export function storedTheme(storage: Pick<Storage, 'getItem'> | null | undefined): Theme | null {
	try {
		const value = storage?.getItem(THEME_STORAGE_KEY);
		return isTheme(value) ? value : null;
	} catch {
		// Storage unavailable (privacy mode, SSR): fall back to system default.
		return null;
	}
}

/** System preference (D5: the default that an explicit choice overrides). */
export function systemTheme(prefersDark: boolean): Theme {
	return prefersDark ? 'dark' : 'light';
}

/** Resolution order: explicit stored choice → system preference. */
export function resolveTheme(
	storage: Pick<Storage, 'getItem'> | null | undefined,
	prefersDark: boolean
): Theme {
	return storedTheme(storage) ?? systemTheme(prefersDark);
}

/** Apply the theme to the document root (`data-theme` on <html>). Idempotent. */
export function applyTheme(
	theme: Theme,
	doc: { documentElement: HTMLElement } | undefined = typeof document !== 'undefined' ? document : undefined
): void {
	if (!doc) return;
	doc.documentElement.dataset.theme = theme;
}

/** Persist + apply an explicit choice (the toggle's only write path). */
export function setTheme(
	theme: Theme,
	storage: Pick<Storage, 'setItem'> | null | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined
): void {
	try {
		storage?.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Persistence failure must never break the visual switch.
	}
	applyTheme(theme);
	currentTheme = theme;
	themeStore.set(theme);
}

/** Resolve (stored → system), apply, and sync the store — called once on app start. */
export function initTheme(): Theme {
	const theme = resolveTheme(
		typeof localStorage !== 'undefined' ? localStorage : undefined,
		typeof window !== 'undefined'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
			: false
	);
	applyTheme(theme);
	currentTheme = theme;
	themeStore.set(theme);
	return theme;
}

/** Flip between the two themes (header/profile toggle). */
export function toggleTheme(): void {
	setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// Module-level mirror for synchronous reads (the store itself is reactive).
let currentTheme: Theme = 'light';

/** App-wide theme signal for reactive UI (icon/aria state). */
export const themeStore = writable<Theme>('light');