<script lang="ts">
	// Leaderboard placeholder (Phase 3 delivery) — honest surface with REAL
	// route guard (see +page.server.ts). No invented metrics or widgets.
	import { Trophy } from '@lucide/svelte';
</script>

<section class="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
	<span
		class="grid size-14 place-items-center rounded-2xl bg-tile-yellow/15 text-tile-yellow"
		aria-hidden="true"
	>
		<Trophy size={26} />
	</span>
	<h1 class="text-2xl font-bold tracking-tight">Leaderboard</h1>
	<p class="max-w-sm text-pretty text-sm text-black/60 dark:text-white/60">
		The daily speedrun standings for your group land here in a later phase —
		who finished fastest, and who let the timer win.
	</p>
	<span class="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/50 dark:border-white/15 dark:text-white/50">
		Coming in a later phase
	</span>
</section>