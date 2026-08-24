// App-wide server-state client (Architecture §TanStack Query for Svelte).
// Durable server state (session, current game, mutations) lives here;
// ephemeral UI state stays in Svelte components.
import { QueryClient } from '@tanstack/svelte-query';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Single-player daily game: refetching on window focus is fine but
			// unnecessary noise; 30s freshness keeps the timer view coherent.
			staleTime: 30_000,
			refetchOnWindowFocus: false,
			retry: 1
		}
	}
});