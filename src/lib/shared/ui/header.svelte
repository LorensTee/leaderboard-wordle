<script lang="ts">
	// App header: title + signed-in state (avatarEmoji/name) + logout.
	// Session truth comes from SSR (event.locals via +layout.server.ts); the
	// Better Auth client only drives the interactive logout.
	import { toast } from 'svelte-sonner';
	import { LogOut } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { signOutUser } from '$lib/app/auth-client';
	import type { SessionData } from '$server/auth/auth';

	let {
		user
	}: {
		user: SessionData['user'] | null;
	} = $props();

	let signingOut = $state(false);

	async function handleSignOut() {
		signingOut = true;
		try {
			await signOutUser();
		} catch {
			signingOut = false;
			toast.error('Sign out failed — please try again.');
		}
	}
</script>

<header class="flex h-14 items-center justify-between border-b border-black/10 px-3 dark:border-white/10">
	<a href={resolve('/')} class="text-lg font-bold tracking-tight" aria-label="Leaderboard Wordle home">
		Leaderboard&nbsp;Wordle
	</a>

	<div class="flex items-center gap-2">
		{#if user}
			<span class="flex items-center gap-2 text-sm">
				<span class="text-xl" aria-hidden="true">{user.avatarEmoji ?? '🙂'}</span>
				<span class="max-w-40 truncate font-medium">{user.name}</span>
			</span>
			<button
				type="button"
				class="key-button inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 dark:border-white/15"
				onclick={handleSignOut}
				disabled={signingOut}
				aria-label="Sign out"
				title="Sign out"
			>
				<LogOut size={18} aria-hidden="true" />
			</button>
		{/if}
	</div>
</header>