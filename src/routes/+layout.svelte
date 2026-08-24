<script lang="ts">
	// App shell: theme reset, server-state provider, header, toast surface.
	import '../app.css';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { Toaster } from 'svelte-sonner';
	import { queryClient } from '$lib/app/query-client';
	import Header from '$lib/shared/ui/header.svelte';

	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<QueryClientProvider client={queryClient}>
	<Header user={data.user} />
	<main class="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-xl flex-col px-3 pb-4 pt-2">
		{@render children()}
	</main>
	<Toaster position="top-center" richColors closeButton />
</QueryClientProvider>