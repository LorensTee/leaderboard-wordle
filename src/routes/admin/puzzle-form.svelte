<script lang="ts">
	// Admin puzzle form (Phase 4, D2 page-owned) — used for schedule, edit
	// and same-day replacement. D3: hintLetter is part of the input; the UI
	// pre-fills the answer's first letter as a default (editable). D5: the
	// word field runs a debounced server validation call that renders the
	// Spec §16 example states — the client never holds the answer pool.
	import { createForm } from '@tanstack/svelte-form';
	import { X } from '@lucide/svelte';
	import { adminApi } from '$lib/shared/api/admin';
	import type { AdminPuzzle, ValidateWordResult } from '$server/admin/service';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import AnswerSearch, { type AnswerSelection } from './answer-search.svelte';

	type Mode = 'schedule' | 'edit' | 'replace';

	type Props = {
		mode: Mode;
		/** Preset date (schedule: the clicked empty slot). */
		presetDate?: string;
		/** The puzzle being edited/replaced. */
		puzzle?: AdminPuzzle | null;
		onSubmit: (values: {
			puzzleDate?: string;
			word: string;
			hintLetter: string;
		}) => Promise<void>;
		onCancel: () => void;
	};

	let { mode, presetDate, puzzle = null, onSubmit, onCancel }: Props = $props();

	const form = createForm(() => ({
		defaultValues: {
			puzzleDate:
				mode === 'edit' ? (puzzle?.date ?? '') : mode === 'schedule' ? (presetDate ?? '') : '',
			word: puzzle?.word ?? '',
			hintLetter: puzzle?.hintLetter ?? ''
		},
		onSubmit: async ({ value }) => {
			const values =
				mode === 'edit'
					? { puzzleDate: value.puzzleDate || undefined, word: value.word, hintLetter: value.hintLetter }
					: mode === 'schedule'
						? { puzzleDate: value.puzzleDate, word: value.word, hintLetter: value.hintLetter }
						: { word: value.word, hintLetter: value.hintLetter };
			await onSubmit(values);
		}
	}));

	// ─── D5 validation chip (server-computed, debounced) ─────────────────────
	type Chip =
		| { kind: 'idle' }
		| { kind: 'checking' }
		| { kind: 'approved' }
		| { kind: 'used'; usedOn: string }
		| { kind: 'rejected' };

	let chip = $state<Chip>({ kind: 'idle' });

	// Debounced server validation (D5) — driven from the input event, not
	// $effect: form/field state is @tanstack/store-backed and its tracking
	// inside Svelte runes is not reliable across adapter versions.
	let wordTimer: ReturnType<typeof setTimeout> | undefined;
	function scheduleCheck(rawValue: string) {
		const normalized = rawValue.trim().toLowerCase();
		if (!/^[a-z]{5}$/.test(normalized)) {
			clearTimeout(wordTimer);
			chip = { kind: 'idle' };
			return;
		}
		clearTimeout(wordTimer);
		chip = { kind: 'checking' };
		wordTimer = setTimeout(async () => {
			try {
				const result: ValidateWordResult = await adminApi.validate(normalized);
				if (result.approved) {
					chip = result.previouslyUsed
						? { kind: 'used', usedOn: result.usedOn ?? '' }
						: { kind: 'approved' };
				} else {
					chip = { kind: 'rejected' };
				}
			} catch {
				// Transient network error — the chip just stays quiet; the
				// server still rejects invalid submissions at submit time.
				chip = { kind: 'idle' };
			}
		}, 300);
	}

	// ─── D3 hint prefill: default the hint to the word's first letter ────────
	let hintTouched = $state(false);
	function onWordInput(
		field: { handleChange: (value: string) => void },
		value: string
	) {
		// field.handleChange is the reactive path (direct state mutation is not).
		field.handleChange(value);
		if (!hintTouched) {
			const first = value.trim().charAt(0).toUpperCase();
			if (first) {
				form.setFieldValue('hintLetter', first);
			}
		}
		scheduleCheck(value);
	}

	// Phase-6 S3/S4 — an answer was picked from the bounded server search.
	// The word came from the dictionary query and its usedOn is server-computed,
	// so the chip reflects approved/used immediately (no trust change: the final
	// mutation still calls resolveApprovedAnswer server-side). Typing afterwards
	// falls back to the existing debounced validate path via onWordInput.
	function onWordSelect(
		field: { handleChange: (value: string) => void },
		selection: AnswerSelection
	) {
		field.handleChange(selection.word);
		if (!hintTouched) {
			const first = selection.word.trim().charAt(0).toUpperCase();
			if (first) {
				form.setFieldValue('hintLetter', first);
			}
		}
		chip = selection.usedOn
			? { kind: 'used', usedOn: selection.usedOn }
			: { kind: 'approved' };
	}

	const titles = {
		schedule: 'Schedule a puzzle',
		edit: 'Edit puzzle',
		replace: 'Replace today\'s puzzle'
	} satisfies Record<Mode, string>;

	const submitting = $derived(form.state.isSubmitting);
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	aria-label={titles[mode]}
	onclick={(e) => {
		if (e.target === e.currentTarget) onCancel();
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') onCancel();
	}}
>
	<div class="w-full max-w-md rounded-2xl border border-black/10 bg-background p-5 shadow-xl dark:border-white/10">
		<div class="mb-4 flex items-start justify-between gap-3">
			<div>
				<h2 class="text-lg font-bold tracking-tight">{titles[mode]}</h2>
				<p class="text-xs text-black/50 dark:text-white/50">
					{#if mode === 'replace'}
						The atomic recovery path for today's puzzle (cron missed).
					{:else if mode === 'edit'}
						Only future scheduled puzzles can be edited.
					{:else}
						Future dates only; server-validated against the approved list.
					{/if}
				</p>
			</div>
			<button
				type="button"
				class="grid size-7 place-items-center rounded-md text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10"
				aria-label="Close"
				onclick={onCancel}
			>
				<X size={15} />
			</button>
		</div>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
			class="flex flex-col gap-4"
		>
			{#if mode !== 'replace'}
				<form.Field name="puzzleDate">
					{#snippet children(field)}
						<div class="flex flex-col gap-1.5">
							<label for="admin-puzzle-date" class="text-sm font-medium">Date</label>
							<Input
								id="admin-puzzle-date"
								type="date"
								name={field.name}
								value={field.state.value}
								oninput={(e) => field.handleChange(e.currentTarget.value)}
								aria-invalid={field.state.meta.errors.length > 0}
							/>
							{#if field.state.meta.errors.length > 0}
								<p class="text-sm text-destructive">{field.state.meta.errors[0]}</p>
							{/if}
						</div>
					{/snippet}
				</form.Field>
			{/if}

			<form.Field name="word">
				{#snippet children(field)}
					<div class="flex flex-col gap-1.5">
						<label for="admin-puzzle-word" class="text-sm font-medium">Answer word</label>
						<AnswerSearch
							id="admin-puzzle-word"
							value={field.state.value}
							onselect={(selection) => onWordSelect(field, selection)}
							oninput={(value) => onWordInput(field, value)}
							aria-invalid={field.state.meta.errors.length > 0}
						/>
						{#if field.state.meta.errors.length > 0}
							<p class="text-sm text-destructive">{field.state.meta.errors[0]}</p>
						{:else if chip.kind === 'checking'}
							<p class="text-xs text-black/45 dark:text-white/45">Checking…</p>
						{:else if chip.kind === 'approved'}
							<p class="text-sm text-emerald-600 dark:text-emerald-400">✓ Approved answer</p>
						{:else if chip.kind === 'used'}
							<p class="text-sm text-amber-600 dark:text-amber-400">
								⚠ Already scheduled/used ({chip.usedOn})
							</p>
						{:else if chip.kind === 'rejected'}
							<p class="text-sm text-destructive">✕ Not in approved answer list</p>
						{/if}
					</div>
				{/snippet}
			</form.Field>

			<form.Field name="hintLetter">
				{#snippet children(field)}
					<div class="flex flex-col gap-1.5">
						<label for="admin-puzzle-hint" class="text-sm font-medium">Hint letter</label>
						<Input
							id="admin-puzzle-hint"
							type="text"
							name={field.name}
							value={field.state.value}
							oninput={(e) => {
								hintTouched = true;
								field.handleChange(e.currentTarget.value);
							}}
							onblur={field.handleBlur}
							maxlength={1}
							autocomplete="off"
							aria-invalid={field.state.meta.errors.length > 0}
						/>
						<p class="text-xs text-black/45 dark:text-white/45">
							One letter that appears in the answer (pre-filled from the word).
						</p>
						{#if field.state.meta.errors.length > 0}
							<p class="text-sm text-destructive">{field.state.meta.errors[0]}</p>
						{/if}
					</div>
				{/snippet}
			</form.Field>

			<div class="mt-1 flex items-center justify-end gap-2">
				<Button type="button" variant="outline" onclick={onCancel} disabled={submitting}>
					Cancel
				</Button>
				<Button type="submit" variant="green" disabled={submitting}>
					{mode === 'schedule' ? 'Schedule' : mode === 'edit' ? 'Save changes' : 'Replace now'}
				</Button>
			</div>
		</form>
	</div>
</div>