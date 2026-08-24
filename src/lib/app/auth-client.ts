// Browser-side Better Auth client (Architecture §Auth ownership: Better Auth
// owns identity/sessions; the app never re-implements session cookies).
// SSR page state comes from hooks.server.ts → event.locals; this client
// drives the interactive sign-in/logout affordances only.
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient();

/**
 * The minimal response signal that matters for OAuth initiation. The full
 * client response also carries `data`; only `error` distinguishes a genuine
 * initiation failure — a successful initiation RESOLVES normally (the
 * client's redirect plugin has already started `window.location` navigation
 * to the provider authorize URL by the time the promise settles; verified
 * against better-auth 1.7.1 `client/fetch-plugins.mjs` redirectPlugin +
 * `api/routes/sign-in.mjs` signInSocial: success → `{ url, redirect: true }`,
 * failure → thrown APIError surfaced as `{ error }`).
 */
export type SocialSignInResponse = {
	/** Non-null on genuine initiation failure (APIError surfaced by the client). */
	error?: { message?: string; status?: number } | null;
	/** Success payload (e.g. `{ url, redirect: true }`) — irrelevant to the outcome decision. */
	data?: unknown;
};

export type SignInOutcome = { ok: true } | { ok: false; message: string };

export const DEFAULT_SIGN_IN_ERROR = 'Sign-in could not start — please try again.';

/**
 * Decide what to tell the user about a `signIn.social()` resolution.
 * A normal successful OAuth initiation must NOT produce an error (regression
 * for the false-error toast bug); only a populated `error` field does.
 * The server-side error details are deliberately NOT surfaced to the user
 * (sanitized NG21-style: internal adapter/config messages must not reach the
 * UI) — a generic failure message is returned and the raw detail is logged
 * for diagnosis.
 */
export function signInOutcome(res: SocialSignInResponse): SignInOutcome {
	if (res.error) {
		console.warn('[sign-in] initiation failed:', res.error);
		return { ok: false, message: DEFAULT_SIGN_IN_ERROR };
	}
	// No error → the client's redirect plugin has (or will) navigate to the
	// provider authorize URL. Never treat this as a failure.
	return { ok: true };
}

/** Google OAuth sign-in; returns to /play when the flow completes. */
export async function signInWithGoogle(): Promise<SocialSignInResponse> {
	return authClient.signIn.social({
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