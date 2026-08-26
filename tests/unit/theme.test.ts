// Phase-2 theme helper tests (D5): storage round-trip, default resolution,
// applyTheme idempotence, persistence write path. DOM-free (node env) via
// injected storage/document seams.
import { describe, expect, it } from 'vitest';
import {
	THEME_STORAGE_KEY,
	applyTheme,
	isTheme,
	resolveTheme,
	setTheme,
	storedTheme,
	systemTheme
} from '../../src/lib/app/theme';

function fakeStorage(initial: Record<string, string> = {}): Storage & { _data: Record<string, string> } {
	const data = { ...initial };
	return {
		_data: data,
		get length() {
			return Object.keys(data).length;
		},
		clear() {
			for (const k of Object.keys(data)) delete data[k];
		},
		getItem(key: string) {
			return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
		},
		key(i: number) {
			return Object.keys(data)[i] ?? null;
		},
		removeItem(key: string) {
			delete data[key];
		},
		setItem(key: string, value: string) {
			data[key] = String(value);
		}
	};
}

function fakeDoc() {
	const root = { dataset: {} as Record<string, string> };
	return { documentElement: root as unknown as HTMLElement };
}

describe('theme helpers', () => {
	it('isTheme only accepts the binary values', () => {
		expect(isTheme('light')).toBe(true);
		expect(isTheme('dark')).toBe(true);
		expect(isTheme('system')).toBe(false);
		expect(isTheme('')).toBe(false);
		expect(isTheme(undefined)).toBe(false);
		expect(isTheme(null)).toBe(false);
	});

	it('storedTheme round-trips and ignores invalid stored values', () => {
		const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dark' });
		expect(storedTheme(storage)).toBe('dark');
		storage.setItem(THEME_STORAGE_KEY, 'light');
		expect(storedTheme(storage)).toBe('light');
		storage.setItem(THEME_STORAGE_KEY, 'neon');
		expect(storedTheme(storage)).toBeNull();
		expect(storedTheme(null)).toBeNull();
		expect(storedTheme(undefined)).toBeNull();
	});

	it('default resolution: explicit stored choice wins; system is the default', () => {
		const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'light' });
		expect(resolveTheme(storage, true)).toBe('light'); // stored beats system
		expect(resolveTheme(fakeStorage(), true)).toBe('dark'); // system default
		expect(resolveTheme(fakeStorage(), false)).toBe('light');
		expect(resolveTheme(null, true)).toBe('dark');
		expect(resolveTheme(undefined, false)).toBe('light');
		expect(systemTheme(true)).toBe('dark');
		expect(systemTheme(false)).toBe('light');
	});

	it('applyTheme sets data-theme and is idempotent', () => {
		const doc = fakeDoc();
		applyTheme('dark', doc);
		expect(doc.documentElement.dataset.theme).toBe('dark');
		applyTheme('dark', doc);
		expect(doc.documentElement.dataset.theme).toBe('dark');
		applyTheme('light', doc);
		expect(doc.documentElement.dataset.theme).toBe('light');
		// No document (SSR/node) — safe no-op.
		expect(() => applyTheme('dark', undefined)).not.toThrow();
	});

	it('setTheme persists and applies', () => {
		const storage = fakeStorage();
		setTheme('dark', storage);
		expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
		// Persistence failure must never break the switch (no-throw contract).
		const broken = { setItem() { throw new Error('quota'); } } as unknown as Storage;
		expect(() => setTheme('light', broken)).not.toThrow();
		expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
	});
});