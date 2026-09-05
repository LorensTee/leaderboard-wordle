// Phase-6 avatar-data pipeline — canonical SERVER allow-list generator.
// Source: src/server/data/emoji-test.source.txt (committed, pinned Unicode
// Emoji 17.0 emoji-test.txt — see provenance header inside the file).
// Output: src/server/data/avatar-emojis.ts (canonical, committed).
// The client twin is built separately by `bun run avatar-list`
// (scripts/build-avatar-list.ts) from the canonical file.
//
// Rules enforced at build time (fails the build on violations):
//   - pinned version/date (17.0 / 2025-08-04) — a re-downloaded file that
//     does not match the pinned baseline throws
//   - every FULLY-QUALIFIED RGI sequence (components excluded — they are
//     not themselves RGI emoji)
//   - no duplicate emoji, no duplicate label
//   - every entry's Unicode group is one of the 9 pinned groups
//   - deterministic ordering: ascending Unicode codepoint sequence
//   - exactly 3,944 entries (production policy pin)
// The core logic is exported so the rules are unit-testable; running this
// file directly (`bun run avatar-data`) rebuilds the canonical file.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const AVATAR_SOURCE = resolve('src/server/data/emoji-test.source.txt');
export const AVATAR_CANONICAL_OUT = resolve('src/server/data/avatar-emojis.ts');

/** The 9 Unicode emoji groups, in the authoritative file order of emoji-test.txt. */
export const AVATAR_GROUPS = [
	'Smileys & Emotion',
	'People & Body',
	'Animals & Nature',
	'Food & Drink',
	'Travel & Places',
	'Activities',
	'Objects',
	'Symbols',
	'Flags'
] as const;

export type AvatarGroup = (typeof AVATAR_GROUPS)[number];

export type ParsedAvatar = {
	/** The stored value: the Unicode emoji string (DB stores this only). */
	emoji: string;
	/** Accessibility label shown to screen readers and as tooltip. */
	label: string;
	/** Unicode group (UTS #51 `# group:` line) — client category metadata. */
	group: AvatarGroup;
};

/** Unescape/escape helpers for the rendered TS literals. */
function escapeTsString(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** A deterministic codepoint-sequence comparator (ascending; longer = greater on tie). */
export function compareCodepointSequences(a: readonly number[], b: readonly number[]): number {
	const n = Math.max(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const x = a[i] ?? -1;
		const y = b[i] ?? -1;
		if (x !== y) return x - y;
	}
	return 0;
}

/**
 * Parse + validate the pinned emoji-test source. Throws on any violation
 * (wrong version/date, unparseable line, duplicate, unknown group, count
 * mismatch). Returns the codepoint-ordered entries with Unicode groups.
 * Deterministic: same source → same output, always.
 */
export function parseAvatarSource(sourceText: string): ParsedAvatar[] {
	const versionLine = sourceText.split('\n').find((l) => l.startsWith('# Version:'));
	const dateLine = sourceText.split('\n').find((l) => l.startsWith('# Date:'));
	if (!versionLine?.includes('17.0')) {
		throw new Error(`unexpected Unicode version: ${versionLine ?? '(missing)'}`);
	}
	if (!dateLine?.includes('2025-08-04')) {
		throw new Error(`unexpected Unicode data date: ${dateLine ?? '(missing)'}`);
	}

	const LINE = /^([0-9A-F]{1,6}(?: [0-9A-F]{1,6})*)\s*;\s*([a-z-]+)\s*#\s*(.+)$/;
	const groupSet = new Set<string>(AVATAR_GROUPS);
	const seen = new Set<string>();
	const seenLabels = new Set<string>();
	const entries: { cps: number[]; entry: ParsedAvatar }[] = [];
	let group = '';

	for (const raw of sourceText.split('\n')) {
		if (raw.startsWith('# group:')) {
			group = raw.slice('# group:'.length).trim();
			continue;
		}
		if (raw.startsWith('#') || raw.trim() === '') continue;
		const m = raw.match(LINE);
		if (!m) throw new Error(`unparseable emoji-test line: ${JSON.stringify(raw)}`);
		const [, hexStr, status, annotation] = m;
		if (status !== 'fully-qualified') continue; // components/minimally/unqualified excluded

		if (!groupSet.has(group)) {
			throw new Error(`entry under unknown/component group "${group}": ${raw}`);
		}
		const parts = annotation.split(/\sE\d+\.\d+\s+/);
		if (parts.length !== 2) {
			throw new Error(`unparseable annotation: ${JSON.stringify(annotation)}`);
		}
		const emoji = parts[0].trim();
		const name = parts[1].trim();
		if (!emoji || !name) throw new Error(`empty emoji/name: ${JSON.stringify(annotation)}`);
		const label = name.charAt(0).toUpperCase() + name.slice(1);
		if (seen.has(emoji)) throw new Error(`duplicate emoji: ${emoji}`);
		if (seenLabels.has(label)) throw new Error(`duplicate label: ${label}`);
		seen.add(emoji);
		seenLabels.add(label);
		entries.push({
			cps: hexStr.split(' ').map((h) => parseInt(h, 16)),
			entry: { emoji, label, group: group as AvatarGroup }
		});
	}

	// Deterministic ordering: ascending codepoint sequence (stable for equal keys).
	entries.sort((a, b) => compareCodepointSequences(a.cps, b.cps));
	const result = entries.map((e) => e.entry);

	// Production pin (pre-phase-6 policy): the fully-qualified RGI count of
	// Unicode Emoji 17.0 emoji-test.txt is exactly 3,944.
	if (result.length !== 3944) {
		throw new Error(`fully-qualified count ${result.length} != 3944 (pinned production policy)`);
	}
	return result;
}

/** The canonical server module (rendered deterministically from the parsed entries). */
export function renderCanonicalAvatarModule(
	entries: readonly ParsedAvatar[],
	sourceSha256: string
): string {
	const rows = entries
		.map(
			(e) =>
				`\t{ emoji: '${escapeTsString(e.emoji)}', label: '${escapeTsString(e.label)}', group: '${escapeTsString(e.group)}' },`
		)
		.join('\n');
	const groups = AVATAR_GROUPS.map((g) => `\t'${escapeTsString(g)}'`).join(',\n');
	return `// GENERATED by \`bun run avatar-data\` from src/server/data/emoji-test.source.txt — DO NOT HAND-EDIT.
// Canonical SERVER-owned avatar allow-list (Phase-2 D4 pipeline).
// PRE-PHASE-6 production data finalization: every standard Unicode RGI emoji
// corresponding to Discord's standard/default emoji (Discord custom/server
// emoji excluded; stored as Unicode sequences, no artwork).
// PHASE-6 category metadata: each entry carries its Unicode group (UTS #51
// \`# group:\` line) for the client picker's category navigation; the group
// order below is the authoritative file order of emoji-test.txt.
//
// Licensed data note: derived from the Unicode emoji test data (see below).
// Labels are the CLDR short names from the same data.
export type AvatarEmoji = {
	/** The stored value: the Unicode emoji string (DB stores this only). */
	emoji: string;
	/** Accessibility label shown to screen readers and as tooltip. */
	label: string;
	/** Unicode group (UTS #51 \`# group:\` line) — client category metadata. */
	group: string;
};

/** The 9 Unicode emoji groups, in the authoritative file order (deterministic). */
export const AVATAR_GROUPS: readonly string[] = [
${groups}
] as const;

// Selection rules (authoritative decision: docs/phases/pre-phase-6/production-data-finalization.md)
//   1. Include every FULLY-QUALIFIED RGI emoji sequence in the Unicode data.
//   2. Exclude standalone components that are not themselves RGI emoji
//      (skin-tone modifiers, keycap parts, tag characters, …).
//   3. Exclude Discord custom/server emoji and animated custom emoji.
//   4. Store the Unicode sequence only — no Discord artwork.
//   5. Deterministic ordering: ascending Unicode codepoint sequence.
// Provenance: Unicode Emoji 17.0 / Unicode 17.0.0,
//   file emoji-test.txt (17.0 — 2025-08-04, 20:55:31 GMT),
//   https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt
//   (© 2025 Unicode, Inc.; UTS #51 data; terms: https://www.unicode.org/terms_of_use.html).
// Source SHA-256: ${sourceSha256}
// Import date: ${new Date().toISOString().slice(0, 10)} — count: ${entries.length}.
// Client twin: src/lib/shared/config/avatar-emojis.generated.ts (built by
// \`bun run avatar-list\` — never hand-edit the generated file).
export const AVATAR_EMOJIS: readonly AvatarEmoji[] = [
${rows}
] as const;

/** Server-side allow-list check (D4): emoji must be in the allowed set. */
export function isValidAvatarEmoji(emoji: string): boolean {
	return AVATAR_EMOJIS.some((entry) => entry.emoji === emoji);
}
`;
}

// CLI entry (`bun run avatar-data`).
if (import.meta.main) {
	const sourceText = readFileSync(AVATAR_SOURCE, 'utf8');
	const sourceSha256 = createHash('sha256').update(sourceText).digest('hex');
	const entries = parseAvatarSource(sourceText);
	writeFileSync(AVATAR_CANONICAL_OUT, renderCanonicalAvatarModule(entries, sourceSha256));
	console.log(`wrote ${entries.length} avatars (${AVATAR_GROUPS.length} groups) -> ${AVATAR_CANONICAL_OUT}`);
	console.log(`source sha256: ${sourceSha256}`);
}
