<script lang="ts">
	// Phase-6 admin answer selector (plan §3, decision C6-9) — a hand-rolled
	// combobox/listbox over the bounded admin search endpoint (S3). This is
	// the SAME input as the puzzle form's word field (id "admin-puzzle-word",
	// label "Answer word") so existing admin.spec `.fill()` typed-entry tests
	// keep working; free typing remains supported.
	//
	// Privacy/architecture (P6-1/P6-14): the 2,315-entry answer dictionary is
	// NEVER sent to the browser. Each keystroke triggers a debounced,
	// authenticated, SQL-bounded request (`GET /api/admin/puzzles/search`).
	// Selecting an option only ever sets a single word that already came from
	// the server; the final schedule/edit/replace mutation re-validates it
	// server-side (resolveApprovedAnswer) — this component is pure UX.
	import { createQuery } from '@tanstack/svelte-query';
	import { Check, Search, TriangleAlert } from '@lucide/svelte';
	import { adminApi, adminKeys } from '$lib/shared/api/admin';
	import type { AnswerSearchResponse } from '$server/admin/service';
	import { Input } from '$lib/components/ui/input';

	export type AnswerSelection = { word: string; usedOn: string | null };

	type Props = {
		/** The input id — kept as "admin-puzzle-word" (existing e2e/label contract). */
		id: string;
		/** Current field value (controlled by the parent form field). */
		value: string;
		/** A server result was picked — parent sets the field + hint + chip. */
		onselect: (selection: AnswerSelection) => void;
		/** Every keystroke (parent keeps hint prefill + debounced validate chip). */
		oninput: (value: string) => void;
		/** Parent field validation state (aria-invalid wiring). */
		'aria-invalid'?: boolean;
	};

	let { id, value, onselect, oninput, 'aria-invalid': ariaInvalid = false }: Props = $props();

	const listboxId = $derived(`${id}-listbox`);
	const optionId = (index: number) => `${id}-option-${index}`;

	// ─── Server search (debounced 300 ms, bounded, authenticated) ────────────
	const q = $derived(value.trim());
	let debouncedQuery = $state('');
	let queryTimer: ReturnType<typeof setTimeout> | undefined;
	// IMPORTANT: read `q` SYNCHRONOUSLY so the effect tracks it. Reading it
	// only inside the async callback would make the effect run once at mount
	// and never re-schedule — debouncedQuery would freeze on the first word.
	$effect(() => {
		const current = q;
		clearTimeout(queryTimer);
		queryTimer = setTimeout(() => {
			debouncedQuery = current;
		}, 300);
		return () => clearTimeout(queryTimer);
	});

	let open = $state(false);
	// Index into the current result list for aria-activedescendant + highlight.
	let activeIndex = $state(-1);

	const searchQuery = createQuery(() => ({
		queryKey: adminKeys.search(debouncedQuery),
		queryFn: (): Promise<AnswerSearchResponse> => adminApi.searchAnswers(debouncedQuery),
		// Only fetch while the list is visible and there is a non-empty query.
		enabled: open && debouncedQuery.length >= 1,
		staleTime: 60_000,
		// Keep the previous results on screen while a new query is in flight.
		placeholderData: (previous) => previous
	}));

	const results = $derived(searchQuery.data?.results ?? []);
	const total = $derived(searchQuery.data?.total ?? 0);

	// Reset the highlight to the first option whenever the list (re)opens.
	$effect(() => {
		if (open) activeIndex = 0;
	});
	// Clamp when results shrink while open (never point past the end). Only
	// when there ARE results — with an empty list the open effect owns the
	// highlight and a clamp to -1 would steal it back before data arrives.
	$effect(() => {
		if (results.length > 0 && activeIndex >= results.length) {
			activeIndex = results.length - 1;
		}
	});

	function openList(): void {
		open = true;
	}

	function closeList(): void {
		open = false;
		activeIndex = -1;
	}

	function selectWord(selection: AnswerSelection): void {
		onselect(selection);
		closeList();
	}

	/** Typing: report to the parent (hint prefill + chip) and reveal the list. */
	function onWordInput(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		oninput(input.value);
		openList();
	}

	/** Keyboard navigation (combobox/listbox pattern). */
	function onWordKeydown(e: KeyboardEvent): void {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) {
				openList();
				return;
			}
			activeIndex = activeIndex < results.length - 1 ? activeIndex + 1 : activeIndex;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (open) activeIndex = activeIndex > 0 ? activeIndex - 1 : 0;
		} else if (e.key === 'Home') {
			e.preventDefault();
			if (open) activeIndex = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			if (open) activeIndex = Math.max(results.length - 1, -1);
		} else if (e.key === 'Enter') {
			// Select the highlighted option; only then submit falls through to
			// the form. With the list closed, Enter submits as before.
			if (open && activeIndex >= 0 && results[activeIndex]) {
				e.preventDefault();
				selectWord(results[activeIndex]);
			}
		} else if (e.key === 'Escape') {
			if (open) {
				// Close just the list (never bubble to the dialog's Escape-cancel).
				e.stopPropagation();
				closeList();
			}
		}
	}

	// Close when focus leaves the whole combobox (outside click / Tab away).
	function onFocusOut(e: FocusEvent): void {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
			closeList();
		}
	}
</script>

<div class="relative" onfocusout={onFocusOut}>
	<Search
		class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40 dark:text-white/40"
	/>
	<Input
		{id}
		type="text"
		class="pl-9"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls={listboxId}
		aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
		value={value}
		oninput={onWordInput}
		onkeydown={onWordKeydown}
		onfocus={openList}
		onblur={onFocusOut}
		maxlength={64}
		autocomplete="off"
		spellcheck="false"
		aria-invalid={ariaInvalid}
	/>

	{#if open}
		<div
			id={listboxId}
			role="listbox"
			aria-label="Approved answers"
			class="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-black/10 bg-background py-1 shadow-xl dark:border-white/15"
		>
			{#if searchQuery.isError}
				<p class="flex items-center gap-1.5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
					<TriangleAlert size={13} />
					Search unavailable — type the full word
				</p>
			{:else if searchQuery.isPending && results.length === 0}
				<p class="px-3 py-2 text-sm text-black/45 dark:text-white/45">Searching…</p>
			{:else if results.length === 0}
				<p class="px-3 py-2 text-sm text-black/45 dark:text-white/45">
					No matching approved answers
				</p>
			{:else}
				{#each results as result, i (result.word)}
					<button
						type="button"
						role="option"
						id={optionId(i)}
						tabindex="-1"
						aria-selected={i === activeIndex}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => selectWord(result)}
						class={[
							'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
							i === activeIndex
								? 'bg-black/5 text-foreground dark:bg-white/10'
								: 'text-foreground'
						].join(' ')}
					>
						<span class="font-medium">{result.word}</span>
						{#if result.usedOn}
							<span class="ml-auto text-xs text-amber-600 dark:text-amber-400">
								⚠ used {result.usedOn}
							</span>
						{/if}
						{#if i === activeIndex}
							<Check size={14} class="shrink-0 text-tile-green" />
						{/if}
					</button>
				{/each}
				{#if total > results.length}
					<p class="px-3 py-1.5 text-xs text-black/40 dark:text-white/40">
						{results.length} of {total} matches
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</div>
