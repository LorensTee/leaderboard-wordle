<script lang="ts">
	// Onboarding (D1/D2/D4) — display name + curated avatar, atomic single
	// PATCH (BOTH fields required while incomplete; nothing persists until
	// the successful submit). Client validation is UX only — the server
	// re-validates everything and is authoritative (Spec §1).
	import { createForm } from '@tanstack/svelte-form';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { queryClient } from '$lib/app/query-client';
	import AvatarPicker from '$lib/shared/ui/avatar-picker.svelte';
	import { meApi, meKeys } from '$lib/shared/api/me';
	import { validateDisplayName } from '$lib/shared/lib/display-name';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	// Warm the ['me'] cache — the shell renders from SSR data; this keeps the
	// shared profile state consistent the moment onboarding completes (D8).
	createQuery(() => ({ queryKey: meKeys.all, queryFn: meApi.getMe }));

	const mutation = createMutation(() => ({ mutationFn: meApi.updateProfile }));

	// Server issues mirrored inline (specific codes) or as a toast; input is
	// preserved (plan §10 state machine).
	let serverError = $state<{ displayName?: string; avatarEmoji?: string }>({});

	const form = createForm(() => ({
		defaultValues: { displayName: '', avatarEmoji: '' },
		onSubmit: async ({ value }) => {
			serverError = {};
			try {
				const user = await mutation.mutateAsync({
					displayName: value.displayName,
					avatarEmoji: value.avatarEmoji
				});
				queryClient.setQueryData(meKeys.all, user);
				toast.success('Welcome to the game!');
				await goto(resolve('/play'));
			} catch (err) {
				const code = (err as { code?: string } | null)?.code;
				if (code === 'NAME_TAKEN') {
					serverError = { displayName: 'That name is already taken' };
				} else if (code === 'NAME_MODERATED') {
					serverError = { displayName: 'This name is not allowed' };
				} else if (code === 'INVALID_NAME') {
					serverError = {
						displayName: 'Use 2–15 characters: letters, numbers, spaces, _ or -'
					};
				} else if (code === 'INVALID_AVATAR') {
					serverError = { avatarEmoji: 'Pick an avatar from the set' };
				} else {
					toast.error('Something went wrong — please try again.');
				}
			}
		}
	}));

	// UX-only validation (mirrors the server rules via the shared twin).
	function validateName({ value }: { value: string }): string | undefined {
		if (value.trim() === '') return 'Choose a display name';
		const result = validateDisplayName(value);
		if (!result.ok) {
			return result.code === 'NAME_MODERATED'
				? 'This name is not allowed'
				: 'Use 2–15 characters: letters, numbers, spaces, _ or -';
		}
		return undefined;
	}

	function validateAvatar({ value }: { value: string }): string | undefined {
		return value === '' ? 'Pick an avatar' : undefined;
	}

	// The form's own isSubmitting spans the awaited mutateAsync; the mutation
	// flag is deliberately NOT consulted (svelte-query v6 `isPending` can stay
	// true after a resolved mutateAsync — the form is the submit owner).
	const submitting = $derived(form.state.isSubmitting);
</script>

<section class="mx-auto w-full max-w-md py-8 sm:py-14">
	<div class="mb-7 text-center">
		<h1 class="text-2xl font-bold tracking-tight">Welcome to the group</h1>
		<p class="mt-1.5 text-sm text-black/60 dark:text-white/60">
			Pick a display name and avatar — this is how your friends will know it's you.
		</p>
	</div>

	<form onsubmit={(e) => { e.preventDefault(); form.handleSubmit(); }} class="flex flex-col gap-7">
		<form.Field name="displayName" validators={{ onChange: validateName }}>
			{#snippet children(field)}
				<div class="flex flex-col gap-2">
					<div class="flex items-baseline justify-between">
						<label for="onboarding-name" class="text-sm font-medium">Display name</label>
						<span class="text-xs tabular-nums text-black/45 dark:text-white/45"
							>{field.state.value.length}/15</span
						>
					</div>
					<Input
						id="onboarding-name"
						type="text"
						name={field.name}
						value={field.state.value}
						oninput={(e) => field.handleChange(e.currentTarget.value)}
						onblur={field.handleBlur}
						maxlength={64}
						autocomplete="off"
						placeholder="e.g. Speedrunner Sam"
						aria-invalid={field.state.meta.errors.length > 0 || serverError.displayName != null}
					/>
					{#if field.state.meta.errors.length > 0}
						<p class="text-sm text-destructive">{field.state.meta.errors[0]}</p>
					{:else if serverError.displayName}
						<p class="text-sm text-destructive">{serverError.displayName}</p>
					{:else}
						<p class="text-xs text-black/45 dark:text-white/45">
							2–15 characters: letters, numbers, spaces, _ or -
						</p>
					{/if}
				</div>
			{/snippet}
		</form.Field>

		<form.Field name="avatarEmoji" validators={{ onChange: validateAvatar }}>
			{#snippet children(field)}
				<div class="flex flex-col gap-2">
					<span class="text-sm font-medium" id="onboarding-avatar-label">Avatar</span>
					<AvatarPicker
						labelledby="onboarding-avatar-label"
						value={field.state.value}
						onselect={(emoji) => field.handleChange(emoji)}
					/>
					{#if field.state.meta.errors.length > 0}
						<p class="text-sm text-destructive">{field.state.meta.errors[0]}</p>
					{:else if serverError.avatarEmoji}
						<p class="text-sm text-destructive">{serverError.avatarEmoji}</p>
					{/if}
				</div>
			{/snippet}
		</form.Field>

		<Button type="submit" size="lg" disabled={submitting} class="w-full">
			{submitting ? 'Setting up your profile…' : 'Start playing'}
		</Button>
	</form>
</section>