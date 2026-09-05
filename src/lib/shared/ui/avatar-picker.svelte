<script lang="ts">
	// Phase-6 shared avatar picker (plan §4) — used by onboarding (required)
	// and profile (optional edit). Renders the 3,944-entry production allow-list
	// WITHOUT mounting thousands of DOM nodes: category tabs (9 Unicode groups)
	// + windowed pages (96 per page, "Show more") + client-side CLDR-label
	// search. Selection is LOCAL state until the form submits; the server
	// allow-list is authoritative (Spec §15: the client picker is not trusted).
	import { browser } from '$app/environment';
	import { Check, Search } from '@lucide/svelte';
	import {
		AVATAR_EMOJIS,
		AVATAR_GROUPS
	} from '$lib/shared/config/avatar-emojis.generated';
	import {
		AVATAR_PAGE_SIZE,
		entriesByGroup,
		normalizeAvatarQuery,
		pageEntries,
		searchAvatars
	} from '$lib/shared/lib/avatar-search';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';

	let {
		value,
		onselect,
		labelledby
	}: {
		/** Currently selected emoji ('' = nothing selected). */
		value: string;
		onselect: (emoji: string) => void;
		/**
		 * id of an element that LABELS this picker (e.g. a form field label).
		 * Wired via `aria-labelledby` on the picker root — the id is never
		 * copied onto the picker's own DOM (no duplicate ids). Falls back to
		 * the built-in `aria-label="Choose an avatar"` when omitted.
		 */
		labelledby?: string;
	} = $props();

	// ─── Recently used (localStorage; P6-8 enhancement) ──────────────────────
	const RECENT_KEY = 'avatar-recent';
	const RECENT_LIMIT = 24;
	const labelByEmoji = new Map(AVATAR_EMOJIS.map((e) => [e.emoji, e.label]));
	const allowed = new Set(AVATAR_EMOJIS.map((e) => e.emoji));

	function loadRecent(): string[] {
		if (!browser) return [];
		try {
			const raw = localStorage.getItem(RECENT_KEY);
			if (!raw) return [];
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) return [];
			return parsed
				.filter((e): e is string => typeof e === 'string' && allowed.has(e))
				.slice(0, RECENT_LIMIT);
		} catch {
			return [];
		}
	}

	function saveRecent(list: string[]): void {
		if (!browser) return;
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(list));
		} catch {
			// Storage unavailable (private mode/quota) — recent is a nicety only.
		}
	}

	let recent = $state<string[]>(loadRecent());

	function pushRecent(emoji: string): void {
		recent = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_LIMIT);
		saveRecent(recent);
	}

	function emojiLabel(emoji: string): string {
		return labelByEmoji.get(emoji) ?? 'Avatar';
	}

	// ─── Search / category / windowed-rendering state ────────────────────────
	let query = $state('');
	let activeGroup = $state(AVATAR_GROUPS[0]);
	let visibleCount = $state(AVATAR_PAGE_SIZE);
	let focusIndex = $state(0);

	const byGroup = $derived(entriesByGroup(AVATAR_EMOJIS));
	const searching = $derived(normalizeAvatarQuery(query) !== '');
	const searchResults = $derived(searching ? searchAvatars(AVATAR_EMOJIS, query) : []);
	const categoryEntries = $derived(byGroup.get(activeGroup) ?? []);
	const activeEntries = $derived(searching ? searchResults : categoryEntries);
	const visible = $derived(pageEntries(activeEntries, visibleCount));
	const hasMore = $derived(visibleCount < activeEntries.length);
	const resultCount = $derived(activeEntries.length);

	function select(emoji: string): void {
		onselect(emoji);
		pushRecent(emoji);
	}

	function onSearchInput(e: Event): void {
		query = (e.currentTarget as HTMLInputElement).value;
		visibleCount = AVATAR_PAGE_SIZE;
		focusIndex = 0;
	}

	function onSearchKeydown(e: KeyboardEvent): void {
		if (e.key === 'ArrowDown') {
			// Move from the search control into the first result (keyboard UX).
			document
				.querySelector('[data-avatar-grid]')
				?.querySelector<HTMLButtonElement>('button[data-avatar]')
				?.focus();
			e.preventDefault();
		} else if (e.key === 'Enter') {
			// Never let Enter in the search box submit the surrounding form.
			e.preventDefault();
		} else if (e.key === 'Escape' && query !== '') {
			query = '';
			visibleCount = AVATAR_PAGE_SIZE;
			focusIndex = 0;
		}
	}

	function switchGroup(group: string): void {
		activeGroup = group;
		visibleCount = AVATAR_PAGE_SIZE;
		focusIndex = 0;
	}

	function showMore(): void {
		visibleCount += AVATAR_PAGE_SIZE;
	}

	// Roving arrow-key navigation (linear: Up/Left = previous, Down/Right =
	// next, Home/End = first/last) — handled per button (a11y-clean: the
	// handler lives on the interactive elements, not the group container).
	function onButtonKeydown(e: KeyboardEvent, index: number): void {
		const grid = (e.currentTarget as HTMLElement).parentElement;
		const buttons = grid?.querySelectorAll<HTMLButtonElement>('button[data-avatar]');
		if (!buttons || buttons.length === 0) return;
		let next: number | null = null;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, index - 1);
		else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			next = Math.min(buttons.length - 1, index + 1);
		} else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = buttons.length - 1;
		if (next === null) return;
		e.preventDefault();
		focusIndex = next;
		queueMicrotask(() => buttons[next as number]?.focus());
	}
</script>

	// ─── Shared grid markup (category mode + search mode) ────────────────────
	{#snippet avatarGrid()}
		<div
			data-avatar-grid
			role="group"
			aria-label="Choose an avatar"
			aria-labelledby={labelledby ?? undefined}
		>
			<div class="grid grid-cols-6 gap-2 sm:grid-cols-8">
				{#each visible as avatar, i (avatar.emoji)}
					<button
						type="button"
						data-avatar
						tabindex={focusIndex === i ? 0 : -1}
						onclick={() => select(avatar.emoji)}
						onkeydown={(e) => onButtonKeydown(e, i)}
						aria-label="{avatar.label} avatar"
						aria-pressed={value === avatar.emoji}
						title={avatar.label}
						class={[
							'relative grid size-12 place-items-center rounded-xl border text-2xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tile-green',
							value === avatar.emoji
								? 'border-tile-green bg-tile-green/15'
								: 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10'
						].join(' ')}
					>
						<span aria-hidden="true">{avatar.emoji}</span>
						{#if value === avatar.emoji}
							<span
								class="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-tile-green text-white"
								aria-hidden="true"
							>
								<Check size={12} stroke-width={3} />
							</span>
						{/if}
					</button>
				{/each}
			</div>
			{#if hasMore}
				<button
					type="button"
					onclick={showMore}
					class="mt-2 w-full rounded-lg border border-black/10 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/5 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
				>
					Show more ({resultCount - visibleCount} more)
				</button>
			{/if}
		</div>
	{/snippet}

<div class="flex flex-col gap-3">
	<div class="relative">
		<Search
			class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40 dark:text-white/40"
		/>
		<input
			type="search"
			class="w-full rounded-lg border border-black/10 bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tile-green dark:border-white/15"
			placeholder="Search emoji…"
			aria-label="Search emoji"
			value={query}
			oninput={onSearchInput}
			onkeydown={onSearchKeydown}
		/>
	</div>

	{#if !searching && recent.length > 0}
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium text-black/50 dark:text-white/50">Recently used</span>
			<div class="grid grid-cols-6 gap-2 sm:grid-cols-8" role="group" aria-label="Recently used avatars">
				{#each recent as emoji (emoji)}
					<button
						type="button"
						onclick={() => select(emoji)}
						aria-label="{emojiLabel(emoji)} avatar"
						aria-pressed={value === emoji}
						title={emojiLabel(emoji)}
						class={[
							'relative grid size-12 place-items-center rounded-xl border text-2xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tile-green',
							value === emoji
								? 'border-tile-green bg-tile-green/15'
								: 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10'
						].join(' ')}
					>
						<span aria-hidden="true">{emoji}</span>
						{#if value === emoji}
							<span
								class="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-tile-green text-white"
								aria-hidden="true"
							>
								<Check size={12} stroke-width={3} />
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if searching}
		<p class="text-xs text-black/45 dark:text-white/45" aria-live="polite">
			{resultCount === 1 ? '1 result' : `${resultCount} results`}
		</p>
		<div class="max-h-72 overflow-y-auto pr-1">
			{@render avatarGrid()}
		</div>
	{:else}
		<Tabs value={activeGroup} onValueChange={switchGroup} class="w-full">
			<TabsList variant="line" class="flex-wrap gap-1">
				{#each AVATAR_GROUPS as group (group)}
					<TabsTrigger value={group} class="flex-none px-2 text-xs">{group}</TabsTrigger>
				{/each}
			</TabsList>
			<TabsContent value={activeGroup} class="max-h-72 overflow-y-auto pr-1">
				{@render avatarGrid()}
			</TabsContent>
		</Tabs>
	{/if}
</div>
