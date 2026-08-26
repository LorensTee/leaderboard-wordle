<script lang="ts">
	// Admin placeholder (Phase 4 delivery) — REAL route guard (admin role,
	// see +page.server.ts); scheduling UI arrives in Phase 4.
	import { Shield } from '@lucide/svelte';
</script>

<section class="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
	<span
		class="grid size-14 place-items-center rounded-2xl bg-tile-gray/15 text-tile-gray"
		aria-hidden="true"
	>
		<Shield size={26} />
	</span>
	<h1 class="text-2xl font-bold tracking-tight">Admin</h1>
	<p class="max-w-sm text-pretty text-sm text-black/60 dark:text-white/60">
		Puzzle scheduling for your group lands here in a later phase — queueing
		approved words ahead of time, with a calendar for every day.
	</p>
	<span class="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/50 dark:border-white/15 dark:text-white/50">
		Coming in a later phase
	</span>
</section>