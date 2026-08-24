// Browser-side Better Auth client (Architecture §Auth ownership: Better Auth
// owns identity/sessions; the app never re-implements session cookies).
// SSR page state comes from hooks.server.ts → event.locals; this client
// drives the interactive sign-in/logout affordances only.
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient();

/** Google OIDC sign-in; returns to /play when the flow completes. */
export async function signInWithGoogle(): Promise<void> {
	await authClient.signIn.social({
		provider: 'google',
		callbackURL: '/play',
		newUserCallbackURL: '/play'
	});
}

/** End the session and return to the landing page (full reload → fresh SSR). */
export async function signOutUser(): Promise<void> {
	await authClient.signOut();
	window.location.assign('/');
}