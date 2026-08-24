<script lang="ts">
	// Display-only timer (Architecture §Timer authority): ACTIVE games tick
	// from the server's started_at; COMPLETED games show the frozen
	// server-computed completion time; FAILED/FORFEITED show nothing.
	// Client clocks never influence game validity.
	import { Clock3 } from '@lucide/svelte';
	import { elapsedSince, formatDuration } from '$lib/shared/lib/format-duration';

	let {
		startedAt = null,
		completionTimeMs = null,
		status = 'ACTIVE'
	}: {
		startedAt?: string | null;
		completionTimeMs?: number | null;
		status?: string;
	} = $props();

	let now = $state(Date.now());

	$effect(() => {
		if (status !== 'ACTIVE' || !startedAt) return;
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const label = $derived.by(() => {
		if (status === 'COMPLETED' && completionTimeMs !== null) {
			return formatDuration(completionTimeMs);
		}
		if (status === 'ACTIVE' && startedAt) {
			return formatDuration(elapsedSince(startedAt, now));
		}
		return null;
	});
</script>

{#if label !== null}
	<span class="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums" aria-label={`Elapsed time ${label}`}>
		<Clock3 size={16} aria-hidden="true" />
		{label}
	</span>
{/if}