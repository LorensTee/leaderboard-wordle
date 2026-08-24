<script lang="ts">
	// Landing / auth page. Signed-in users get a clear path to today's game;
	// signed-out users get the Google sign-in (Better Auth client).
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Play, Sparkles } from '@lucide/svelte';
	import { signInWithGoogle } from '$lib/app/auth-client';

	const user = $derived(page.data.user);
	let signingIn = $state(false);

	async function handleSignIn() {
		signingIn = true;
		try {
			await signInWithGoogle();
			// The OAuth redirect takes over; if it returns without navigating,
			// surface a failure instead of a silent stall.
			toast.error('Sign-in could not start — please try again.');
			signingIn = false;
		} catch {
			signingIn = false;
			toast.error('Sign-in failed — please try again.');
		}
	}
</script>

<section class="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
	<div class="flex flex-col items-center gap-3">
		<span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-tile-green/15 text-tile-green" aria-hidden="true">
			<Sparkles size={26} />
		</span>
		<h1 class="text-3xl font-extrabold tracking-tight">Leaderboard Wordle</h1>
		<p class="max-w-sm text-pretty text-sm text-black/60 dark:text-white/60">
			One puzzle a day for your group of friends. Six guesses, green and yellow
			tiles, and a timer that only the server can read.
		</p>
	</div>

	{#if user}
		<div class="flex flex-col items-center gap-3">
			<p class="text-sm text-black/60 dark:text-white/60">
				Signed in as <span class="font-semibold">{user.name}</span>
			</p>
			<a
				href={resolve('/play')}
				class="inline-flex h-11 items-center gap-2 rounded-xl bg-tile-green px-6 font-semibold text-white hover:brightness-105"
			>
				<Play size={18} aria-hidden="true" />
				Play today&rsquo;s puzzle
			</a>
		</div>
	{:else}
		<button
			type="button"
			class="inline-flex h-11 items-center gap-2 rounded-xl bg-key-fg px-6 font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-black"
			onclick={handleSignIn}
			disabled={signingIn}
		>
			{#if signingIn}
				<span class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true"></span>
				Signing in…
			{:else}
				<svg class="size-5" viewBox="0 0 24 24" aria-hidden="true">
					<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
					<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
					<path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
					<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
				</svg>
				Sign in with Google
			{/if}
		</button>
		<p class="text-xs text-black/40 dark:text-white/40">
			Private play for your group — Google account required.
		</p>
	{/if}
</section>