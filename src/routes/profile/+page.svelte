<script lang="ts">
	// Profile (Spec §2) — edit display name / avatar, switch theme, log out.
	// Server-authoritative: the PATCH response updates the ['me'] cache (D8,
	// no optimistic mutations); client validation is UX only.
	import { createForm } from '@tanstack/svelte-form';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { LogOut, Moon, Sun } from '@lucide/svelte';
	import { queryClient } from '$lib/app/query-client';
	import { signOutUser } from '$lib/app/auth-client';
	import { setTheme, themeStore } from '$lib/app/theme';
	import AvatarPicker from '$lib/shared/ui/avatar-picker.svelte';
	import { meApi, meKeys } from '$lib/shared/api/me';
	import { validateDisplayName } from '$lib/shared/lib/display-name';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	const meQuery = createQuery(() => ({
		queryKey: meKeys.all,
		queryFn: meApi.getMe,
		staleTime: 0 // profile edits must show fresh server truth
	}));
	const mutation = createMutation(() => ({ mutationFn: meApi.updateProfile }));

	let serverError = $state<string | undefined>(undefined);

	const form = createForm(() => ({
		defaultValues: { displayName: '', avatarEmoji: '' },
		onSubmit: async ({ value }) => {
			serverError = undefined;
			const current = meQuery.data;
			if (!current) return;
			// Send ONLY the fields that actually changed (post-onboarding edits
			// accept either field).
			const patch: { displayName?: string; avatarEmoji?: string } = {};
			if (value.displayName !== current.name) patch.displayName = value.displayName;
			if (value.avatarEmoji !== current.avatarEmoji) patch.avatarEmoji = value.avatarEmoji;
			if (Object.keys(patch).length === 0) return;
			try {
				const user = await mutation.mutateAsync(patch);
				queryClient.setQueryData(meKeys.all, user);
				toast.success('Profile updated');
			} catch (err) {
				const code = (err as { code?: string } | null)?.code;
				if (code === 'NAME_TAKEN') serverError = 'That name is already taken';
				else if (code === 'NAME_MODERATED') serverError = 'This name is not allowed';
				else if (code === 'INVALID_NAME')
					serverError = 'Use 2–15 characters: letters, numbers, spaces, _ or -';
				else if (code === 'INVALID_AVATAR') serverError = 'Pick an avatar from the set';
				else toast.error('Something went wrong — please try again.');
			}
		}
	}));

	// Seed the form once when the ['me'] query resolves (SSR gives no values).
	let seeded = $state(false);
	$effect(() => {
		if (!seeded && meQuery.data) {
			seeded = true;
			form.reset({ displayName: meQuery.data.name, avatarEmoji: meQuery.data.avatarEmoji });
			serverError = undefined;
		}
	});

	function validateName({ value }: { value: string }): string | undefined {
		if (value.trim() === '') return "Display name can't be empty";
		const result = validateDisplayName(value);
		if (!result.ok) {
			return result.code === 'NAME_MODERATED'
				? 'This name is not allowed'
				: 'Use 2–15 characters: letters, numbers, spaces, _ or -';
		}
		return undefined;
	}

	const isDark = $derived($themeStore === 'dark');
	// The form's own isSubmitting spans the awaited mutateAsync; the mutation
	// flag is deliberately NOT consulted (svelte-query v6 `isPending` can stay
	// true after a resolved mutateAsync — the form is the submit owner).
	const submitting = $derived(form.state.isSubmitting);
	const dirty = $derived(
		meQuery.data != null &&
			(form.state.values.displayName !== meQuery.data.name ||
				form.state.values.avatarEmoji !== meQuery.data.avatarEmoji)
	);

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

<section class="mx-auto w-full max-w-md py-8 sm:py-10">
	{#if meQuery.isPending}
		<!-- Shell renders from SSR; the panel shows a skeleton while ['me'] loads. -->
		<div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading profile">
			<div class="h-7 w-32 animate-pulse rounded-md bg-black/10 dark:bg-white/10"></div>
			<div class="h-9 w-full animate-pulse rounded-md bg-black/10 dark:bg-white/10"></div>
			<div class="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8">
				{#each Array.from({ length: 24 }, (_, i) => i) as i (i)}
					<div class="size-12 animate-pulse rounded-xl bg-black/10 dark:bg-white/10"></div>
				{/each}
			</div>
		</div>
	{:else if meQuery.data}
		<div class="mb-7 flex items-center gap-3">
			<span
				class="grid size-12 place-items-center rounded-2xl bg-black/5 text-2xl dark:bg-white/10"
				aria-hidden="true"
			>
				{meQuery.data.avatarEmoji}
			</span>
			<div class="min-w-0">
				<h1 class="truncate text-xl font-bold tracking-tight">{meQuery.data.name}</h1>
				<p class="text-xs text-black/50 dark:text-white/50">Your profile</p>
			</div>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); form.handleSubmit(); }} class="flex flex-col gap-7">
			<form.Field name="displayName" validators={{ onChange: validateName }}>
				{#snippet children(field)}
					<div class="flex flex-col gap-2">
						<div class="flex items-baseline justify-between">
							<label for="profile-name" class="text-sm font-medium">Display name</label>
							<span class="text-xs tabular-nums text-black/45 dark:text-white/45"
								>{field.state.value.length}/15</span
							>
						</div>
						<Input
							id="profile-name"
							type="text"
							name={field.name}
							value={field.state.value}
							oninput={(e) => field.handleChange(e.currentTarget.value)}
							onblur={field.handleBlur}
							maxlength={64}
							autocomplete="off"
							aria-invalid={field.state.meta.errors.length > 0 || serverError != null}
						/>
						{#if field.state.meta.errors.length > 0}
							<p class="text-sm text-destructive">{field.state.meta.errors[0]}</p>
						{:else if serverError}
							<p class="text-sm text-destructive">{serverError}</p>
						{:else}
							<p class="text-xs text-black/45 dark:text-white/45">
								2–15 characters: letters, numbers, spaces, _ or -
							</p>
						{/if}
					</div>
				{/snippet}
			</form.Field>

			<form.Field name="avatarEmoji">
				{#snippet children(field)}
					<div class="flex flex-col gap-2">
						<span class="text-sm font-medium" id="profile-avatar-label">Avatar</span>
						<AvatarPicker
							id="profile-avatar-label"
							value={field.state.value}
							onselect={(emoji) => field.handleChange(emoji)}
						/>
					</div>
				{/snippet}
			</form.Field>

			<Button
				type="submit"
				disabled={submitting || !dirty}
				class="w-full sm:w-auto sm:self-start sm:px-8"
			>
				{submitting ? 'Saving…' : 'Save changes'}
			</Button>
		</form>

		<div class="mt-8 flex items-center justify-between gap-4">
			<div>
				<p class="text-sm font-medium">Theme</p>
				<p class="text-xs text-black/45 dark:text-white/45">Saved on this device.</p>
			</div>
			<div
				class="flex rounded-lg border border-black/10 p-1 dark:border-white/15"
				role="radiogroup"
				aria-label="Theme"
			>
				<button
					type="button"
					onclick={() => setTheme('light')}
					class={[
						'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
						!isDark
							? 'bg-black/10 text-black dark:bg-white/15 dark:text-white'
							: 'text-black/50 dark:text-white/50'
					].join(' ')}
					aria-pressed={!isDark}
				>
					<Sun size={15} aria-hidden="true" /> Light
				</button>
				<button
					type="button"
					onclick={() => setTheme('dark')}
					class={[
						'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
						isDark
							? 'bg-black/10 text-black dark:bg-white/15 dark:text-white'
							: 'text-black/50 dark:text-white/50'
					].join(' ')}
					aria-pressed={isDark}
				>
					<Moon size={15} aria-hidden="true" /> Dark
				</button>
			</div>
		</div>

		<div class="mt-8 border-t border-black/10 pt-6 dark:border-white/10">
			<Button
				type="button"
				variant="outline"
				onclick={handleSignOut}
				disabled={signingOut}
				class="w-full text-destructive sm:w-auto sm:self-start"
			>
				<LogOut size={16} aria-hidden="true" />
				{signingOut ? 'Signing out…' : 'Sign out'}
			</Button>
		</div>
	{/if}
</section>