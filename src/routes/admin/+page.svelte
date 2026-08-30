<script lang="ts">
	// Admin page (Phase 4) — puzzle scheduling & management calendar.
	//
	// - Role-gated twice: SSR guard in +page.server.ts (requireAdmin) and the
	//   /api/admin/* Hono chain (requireAuth + requireAdmin, D1). The page
	//   only renders for admins; non-admins never see or fetch word data.
	// - Calendar: one month at a time (runtime-rendered grid, D2 page-owned
	//   components); each day is a puzzle slot with word + hint + state
	//   badges; today highlighted; month navigation.
	// - Mutations: future SCHEDULED → schedule/edit/delete (D6); today
	//   SCHEDULED + unlocked → atomic same-day replacement (D8) — the ONLY
	//   today mutation. ACTIVE/FINALIZED/locked days are immutable badges.
	// - Server truth: no optimistic updates; mutations invalidate
	//   `['admin','puzzles']` and refetch; D7 gap warnings render from the
	//   response; toasts per the app pattern.
	import { CalendarDate } from '@internationalized/date';
	import { endOfMonth, startOfMonth, today as intlToday } from '@internationalized/date';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import { RefreshCw, Shield, TriangleAlert } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { queryClient } from '$lib/app/query-client';
	import { adminApi, adminKeys } from '$lib/shared/api/admin';
	import type { AdminPuzzle, ReplaceTodayInput, UpdatePatch } from '$server/admin/service';
	import PuzzleCalendar from './puzzle-calendar.svelte';
	import PuzzleForm from './puzzle-form.svelte';
	import DayDetail from './day-detail.svelte';
	import { Button } from '$lib/components/ui/button';

	type FormState =
		| { mode: 'schedule'; date: string }
		| { mode: 'edit'; puzzle: AdminPuzzle }
		| { mode: 'replace'; puzzle: AdminPuzzle }
		| null;

	// Today's Asia/Manila date — UI highlight + replace-panel detection only;
	// the server is the authority for every mutation decision (SQL today).
	const today = $derived(intlToday('Asia/Manila').toString());

	/** Visible month (MonthView = year + month of a CalendarDate). */
	let monthView = $state<CalendarDate>(new CalendarDate(intlToday('Asia/Manila').year, intlToday('Asia/Manila').month, 1));
	let activeForm = $state<FormState>(null);
	let confirmDelete = $state<AdminPuzzle | null>(null);
	let gapsWarning = $state<string[]>([]);
	/** Open day cell (word-only cells → detail modal; user direction). */
	let detail = $state<{ date: string; puzzle: AdminPuzzle | null } | null>(null);

	const from = $derived(startOfMonth(monthView).toString());
	const to = $derived(endOfMonth(monthView).toString());

	const puzzlesQuery = createQuery(() => ({
		queryKey: adminKeys.window(from, to),
		queryFn: () => adminApi.list(from, to),
		staleTime: 0 // admin mutations must show fresh server truth
	}));

	const puzzles = $derived(puzzlesQuery.data ?? []);

	// ─── Mutations (one in flight at a time — server truth on settle) ────────
	// mutationFn receives ONE argument — wrap the two-arg client methods.
	const scheduleMutation = createMutation(() => ({
		mutationFn: (input: { puzzleDate: string; word: string; hintLetter: string }) =>
			adminApi.schedule(input)
	}));
	const updateMutation = createMutation(() => ({
		mutationFn: (args: { id: string; patch: UpdatePatch }) => adminApi.update(args.id, args.patch)
	}));
	const deleteMutation = createMutation(() => ({ mutationFn: adminApi.remove }));
	const replaceMutation = createMutation(() => ({
		mutationFn: (args: { id: string; input: ReplaceTodayInput }) =>
			adminApi.replaceToday(args.id, args.input)
	}));

	function invalidatePuzzles() {
		return queryClient.invalidateQueries({ queryKey: adminKeys.puzzles });
	}

	async function handleSchedule(values: {
		puzzleDate?: string;
		word: string;
		hintLetter: string;
	}) {
		try {
			await scheduleMutation.mutateAsync({
				puzzleDate: values.puzzleDate ?? '',
				word: values.word,
				hintLetter: values.hintLetter
			});
			await invalidatePuzzles();
			toast.success('Puzzle scheduled');
			activeForm = null;
		} catch (err) {
			toastFormError(err);
		}
	}

	async function handleEdit(values: {
		puzzleDate?: string;
		word: string;
		hintLetter: string;
	}) {
		const puzzle = activeForm?.mode === 'edit' ? activeForm.puzzle : null;
		if (!puzzle) return;
		try {
			const patch: { puzzleDate?: string; word?: string; hintLetter?: string } = {};
			if (values.puzzleDate && values.puzzleDate !== puzzle.date) patch.puzzleDate = values.puzzleDate;
			if (values.word.trim().toLowerCase() !== puzzle.word) patch.word = values.word;
			if (values.hintLetter.trim().toUpperCase() !== puzzle.hintLetter) patch.hintLetter = values.hintLetter;
			if (Object.keys(patch).length === 0) {
				activeForm = null;
				return;
			}
			const result = await updateMutation.mutateAsync({ id: puzzle.id, patch });
			await invalidatePuzzles();
			if (result.gaps.length > 0) gapsWarning = result.gaps;
			toast.success('Puzzle updated');
			activeForm = null;
		} catch (err) {
			toastFormError(err);
		}
	}

	async function handleReplace(values: { word: string; hintLetter: string }) {
		const puzzle = activeForm?.mode === 'replace' ? activeForm.puzzle : null;
		if (!puzzle) return;
		try {
			await replaceMutation.mutateAsync({ id: puzzle.id, input: values });
			await invalidatePuzzles();
			toast.success('Today\'s puzzle replaced');
			activeForm = null;
		} catch (err) {
			toastFormError(err);
		}
	}

	async function handleDelete() {
		if (!confirmDelete) return;
		try {
			const result = await deleteMutation.mutateAsync(confirmDelete.id);
			await invalidatePuzzles();
			if (result.gaps.length > 0) gapsWarning = result.gaps;
			toast.success('Puzzle deleted');
			confirmDelete = null;
		} catch (err) {
			toastFormError(err);
			confirmDelete = null;
		}
	}

	function toastFormError(err: unknown) {
		const code = (err as { code?: string } | null)?.code;
		// The D10 codes carry precise copy; anything else falls back generic.
		const message =
			code === 'ANSWER_NOT_APPROVED'
				? 'That word is not in the approved answer list'
				: code === 'ANSWER_ALREADY_SCHEDULED'
					? 'This answer is already scheduled or used'
					: code === 'DATE_TAKEN'
						? 'Another puzzle is already scheduled for that date'
						: code === 'INVALID_HINT'
							? 'The hint must be one letter that appears in the answer'
							: code === 'NOT_FUTURE'
								? 'Only future dates can be scheduled'
								: code === 'PUZZLE_IMMUTABLE' || code === 'INVALID_STATE'
									? 'That puzzle is no longer editable'
									: code === 'FORBIDDEN'
										? 'Admin access required'
										: 'Something went wrong — please try again.';
		toast.error(message);
	}

	// The today-SCHEDULED replacement panel (D8) — driven by the row, not the form.
	const todayPuzzle = $derived(
		puzzles.find((p) => p.date === today) ?? null
	);
	const needsReplacement = $derived(
		todayPuzzle !== null && todayPuzzle.status === 'SCHEDULED' && todayPuzzle.lockedAt === null
	);

	const anyBusy = $derived(
		scheduleMutation.isPending || updateMutation.isPending || deleteMutation.isPending || replaceMutation.isPending
	);
</script>

<section class="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
	<div class="mb-6 flex items-center gap-3">
		<span
			class="grid size-12 place-items-center rounded-2xl bg-tile-gray/15 text-tile-gray"
			aria-hidden="true"
		>
			<Shield size={26} />
		</span>
		<div>
			<h1 class="text-xl font-bold tracking-tight">Admin — puzzle scheduling</h1>
			<p class="text-sm text-black/50 dark:text-white/50">
				Queue approved words ahead of time; the server validates everything.
			</p>
		</div>
	</div>

	{#if needsReplacement}
		<div
			class="mb-5 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
			role="status"
		>
			<div class="flex items-start gap-2">
				<TriangleAlert size={16} class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
				<div class="text-sm">
					<p class="font-semibold text-amber-700 dark:text-amber-300">
						Today's puzzle was never started (cron missed?)
					</p>
					<p class="text-amber-700/80 dark:text-amber-300/80">
						You can replace the answer atomically — no players have started yet.
					</p>
				</div>
			</div>
			<div>
				<Button
					size="sm"
					variant="green"
					onclick={() => activeForm = { mode: 'replace', puzzle: todayPuzzle! }}
				>
					Replace today's puzzle
				</Button>
			</div>
		</div>
	{/if}

	{#if gapsWarning.length > 0}
		<div
			class="mb-5 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
			role="status"
		>
			<TriangleAlert size={16} class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
			<p class="text-sm text-amber-700/90 dark:text-amber-300/90">
				<span class="font-semibold text-amber-700 dark:text-amber-300">Missing puzzle alert:</span>
				no puzzle scheduled for
				{#each gapsWarning as d, i (d)}
					<span class="font-mono text-xs"> {d}{i < gapsWarning.length - 1 ? ',' : ''}</span>
				{/each}
				— the settlement cron will flag a missing today's puzzle if any of these
				days become today.
			</p>
		</div>
	{/if}

	{#if puzzlesQuery.isPending}
		<div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading puzzle calendar">
			<div class="h-7 w-40 animate-pulse rounded-md bg-black/10 dark:bg-white/10"></div>
			<div class="grid grid-cols-7 gap-1.5">
				{#each Array.from({ length: 35 }, (_, i) => i) as i (i)}
					<div class="min-h-20 animate-pulse rounded-xl bg-black/5 dark:bg-white/5"></div>
				{/each}
			</div>
		</div>
	{:else if puzzlesQuery.isError}
		<div
			class="flex flex-col items-center gap-3 rounded-xl border border-black/10 p-8 text-center dark:border-white/10"
			role="alert"
		>
			<p class="text-sm text-black/60 dark:text-white/60">
				Couldn't load the puzzle calendar. Please try again.
			</p>
			<Button size="sm" variant="outline" onclick={() => puzzlesQuery.refetch()} disabled={puzzlesQuery.isFetching && !puzzlesQuery.isPending}>
				<RefreshCw size={14} />
				Retry
			</Button>
		</div>
	{:else}
		<PuzzleCalendar
			month={monthView}
			puzzles={puzzles}
			today={today}
			onPrev={() => {
				monthView = monthView.subtract({ months: 1 });
			}}
			onNext={() => {
				monthView = monthView.add({ months: 1 });
			}}
			onOpenDay={(date, puzzle) => (detail = { date, puzzle })}
			onSchedule={(date) => (activeForm = { mode: 'schedule', date })}
		/>
	{/if}
</section>

{#if detail}
	<DayDetail
		date={detail.date}
		puzzle={detail.puzzle}
		{today}
		busy={anyBusy}
		onEdit={(puzzle) => {
			detail = null;
			activeForm = { mode: 'edit', puzzle };
		}}
		onDelete={(puzzle) => {
			detail = null;
			confirmDelete = puzzle;
		}}
		onReplace={(puzzle) => {
			detail = null;
			activeForm = { mode: 'replace', puzzle };
		}}
		onSchedule={(date) => {
			detail = null;
			activeForm = { mode: 'schedule', date };
		}}
		onClose={() => (detail = null)}
	/>
{/if}

{#if activeForm}
	{#if activeForm.mode === 'schedule'}
		<PuzzleForm
			mode="schedule"
			presetDate={activeForm.date}
			onSubmit={handleSchedule}
			onCancel={() => (activeForm = null)}
		/>
	{:else if activeForm.mode === 'edit'}
		<PuzzleForm
			mode="edit"
			puzzle={activeForm.puzzle}
			onSubmit={handleEdit}
			onCancel={() => (activeForm = null)}
		/>
	{:else if activeForm.mode === 'replace'}
		<PuzzleForm
			mode="replace"
			puzzle={activeForm.puzzle}
			onSubmit={handleReplace}
			onCancel={() => (activeForm = null)}
		/>
	{/if}
{/if}

{#if confirmDelete}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
		role="alertdialog"
		aria-modal="true"
		tabindex="-1"
		aria-label="Confirm puzzle deletion"
		onclick={(e) => {
			if (e.target === e.currentTarget) confirmDelete = null;
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') confirmDelete = null;
		}}
	>
		<div class="w-full max-w-sm rounded-2xl border border-black/10 bg-background p-5 shadow-xl dark:border-white/10">
			<h2 class="text-lg font-bold tracking-tight">Delete puzzle?</h2>
			<p class="mt-2 text-sm text-black/60 dark:text-white/60">
				Delete the puzzle for <span class="font-mono text-xs">{confirmDelete.date}</span>
				(<span class="font-semibold">{confirmDelete.word}</span>)? This day will become
				a missing-puzzle gap and the settlement cron will alert if it becomes today.
			</p>
			<div class="mt-4 flex items-center justify-end gap-2">
				<Button type="button" variant="outline" onclick={() => (confirmDelete = null)} disabled={anyBusy}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="destructive"
					class="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:text-[#121213] dark:hover:bg-destructive/80"
					onclick={handleDelete}
					disabled={anyBusy}
				>
					Delete puzzle
				</Button>
			</div>
		</div>
	</div>
{/if}