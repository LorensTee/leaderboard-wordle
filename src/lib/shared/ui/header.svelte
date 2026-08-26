<script lang="ts">
	// App header: brand mark, role-aware nav tabs (D6), theme toggle (D5),
	// user chip + logout. Session truth comes from SSR (event.locals via
	// +layout.server.ts) while the ['me'] query is pending, then from the
	// TanStack cache (so name/avatar/role updates reflect immediately after
	// profile saves / admin bootstrap). Not-onboarded users see a minimal
	// header WITHOUT tabs (D6).
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { LogOut, Moon, Play, Shield, Sun, Trophy, User } from '@lucide/svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import type { Component } from 'svelte';
	import { signOutUser } from '$lib/app/auth-client';
	import { themeStore, toggleTheme } from '$lib/app/theme';
	import { meApi, meKeys } from '$lib/shared/api/me';
	import type { SessionData } from '$server/auth/auth';

	let {
		user
	}: {
		user: SessionData['user'] | null;
	} = $props();

	const meQuery = createQuery(() => ({
		queryKey: meKeys.all,
		queryFn: meApi.getMe
	}));

	// SSR fallback while the query is pending → never a wrong theme/header.
	const onboarded = $derived(
		meQuery.data ? meQuery.data.onboardingCompleted : user?.onboarding_completed_at != null
	);
	const isAdmin = $derived(meQuery.data?.role === 'admin' || user?.role === 'admin');
	const name = $derived(meQuery.data?.name ?? user?.name);
	const avatarEmoji = $derived(meQuery.data?.avatarEmoji ?? user?.avatarEmoji ?? '🙂');
	const isDark = $derived($themeStore === 'dark');

	const pathname = $derived(page.url.pathname);
	// Exact segment match (a "/play" prefix must not light up "/playground").
	const isActive = $derived((href: string) =>
		href === '/play'
			? pathname === '/play' || pathname === '/'
			: pathname === href || pathname.startsWith(`${href}/`)
	);

	type Tab = { href: '/' | '/play' | '/leaderboard' | '/profile' | '/admin'; label: string; icon: Component };
	const baseTabs: Tab[] = [
		{ href: '/play', label: 'Play', icon: Play },
		{ href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
		{ href: '/profile', label: 'Profile', icon: User }
	];
	const adminTab: Tab = { href: '/admin', label: 'Admin', icon: Shield };
	const tabs = $derived<Tab[]>(isAdmin ? [...baseTabs, adminTab] : baseTabs);

	// Active tab: underline + full-contrast text (D6: aria-current + underline).
	const tabClass = $derived((href: string) => {
		const active = isActive(href);
		return [
			'inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium transition-colors sm:h-14 sm:px-2.5',
			active
				? 'border-tile-green text-black dark:text-white'
				: 'text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white'
		].join(' ');
	});

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

<header class="border-b border-black/10 dark:border-white/10">
	<!-- max-w-3xl: brand + tabs + controls fit ONE row on desktop; on mobile
	     the wrap keeps brand+controls on row 1 and moves the tabs to row 2. -->
	<div class="mx-auto flex w-full max-w-3xl flex-wrap items-center px-3">
		<a
			href={resolve('/')}
			class="order-1 flex h-14 items-center gap-2 text-base font-bold tracking-tight"
			aria-label="Leaderboard Wordle home"
		>
			<!-- Product mark: a 2×2 slice of the Wordle board (green/yellow/gray). -->
			<span
				class="grid size-7 shrink-0 grid-cols-2 gap-[3px] rounded-md bg-black/5 p-[5px] dark:bg-white/10"
				aria-hidden="true"
			>
				<span class="rounded-[2px] bg-tile-green"></span>
				<span class="rounded-[2px] bg-tile-yellow"></span>
				<span class="rounded-[2px] bg-tile-gray"></span>
				<span class="rounded-[2px] bg-tile-empty-border dark:bg-white/25"></span>
			</span>
			<span class="truncate">Leaderboard Wordle</span>
		</a>

		{#if onboarded}
			<nav
				class="order-3 -mx-3 flex w-[calc(100%+1.5rem)] items-center overflow-x-auto border-t border-black/10 px-3 sm:order-2 sm:mx-0 sm:w-auto sm:border-t-0 sm:px-0 dark:border-white/10"
				aria-label="Main"
			>
				{#each tabs as tab (tab.href)}
					<a
						href={resolve(tab.href)}
						class={tabClass(tab.href)}
						aria-current={isActive(tab.href) ? 'page' : undefined}
					>
						<tab.icon size={16} aria-hidden="true" />
						{tab.label}
					</a>
				{/each}
			</nav>
		{/if}

		<div class="order-2 ml-auto flex items-center gap-1.5 sm:order-3">
			<button
				type="button"
				onclick={toggleTheme}
				class="grid size-9 shrink-0 place-items-center rounded-lg border border-black/10 transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
				aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
				title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
			>
				{#if isDark}
					<Sun size={18} aria-hidden="true" />
				{:else}
					<Moon size={18} aria-hidden="true" />
				{/if}
			</button>
			{#if user || meQuery.data}
				<a
					href={resolve('/profile')}
					class="flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-black/5 sm:pr-3 dark:hover:bg-white/10"
					title="Profile"
				>
					<span
						class="grid size-8 shrink-0 place-items-center rounded-full bg-black/5 text-lg dark:bg-white/10"
						aria-hidden="true"
					>
						{avatarEmoji}
					</span>
					<!-- Name hidden on narrow screens so the header stays ONE row
					     with all controls (brand + theme + avatar + logout fit 390px). -->
					<span class="hidden truncate text-sm font-medium sm:block">{name}</span>
				</a>
				<button
					type="button"
					class="key-button grid size-9 shrink-0 place-items-center rounded-lg border border-black/10 transition-colors hover:bg-black/5 disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/10"
					onclick={handleSignOut}
					disabled={signingOut}
					aria-label="Sign out"
					title="Sign out"
				>
					<LogOut size={18} aria-hidden="true" />
				</button>
			{/if}
		</div>
	</div>
</header>