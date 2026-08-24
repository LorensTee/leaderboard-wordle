// v21 regression: a NORMAL successful Google OAuth initiation must never
// surface an error. better-auth 1.7.1's `signIn.social()` RESOLVES on both
// paths — success (redirect plugin already navigated to the authorize URL)
// and genuine failure (APIError surfaced as `{ error }`) — so the UI must
// key off the response's `error` field, not off promise resolution.
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SIGN_IN_ERROR,
	signInOutcome,
	type SocialSignInResponse
} from '../../src/lib/app/auth-client';

/** The shape better-auth's client returns on the SUCCESS path. */
const successResponse: SocialSignInResponse = {
	error: null,
	data: { url: 'https://accounts.google.com/o/oauth2/...', redirect: true }
};

describe('signInOutcome (no false error on successful OAuth initiation)', () => {
	it('a successful initiation (error: null) is ok:true — NO error toast', () => {
		expect(signInOutcome(successResponse)).toEqual({ ok: true });
	});

	it('a genuine initiation failure (error populated) is ok:false — sanitized generic message', () => {
		// The server-side detail ('Provider not found…') must NOT reach the UI
		// (NG21-style sanitization); it is only console-logged for diagnosis.
		expect(
			signInOutcome({
				error: { message: 'Provider not found. Make sure to add the provider in your auth config' }
			})
		).toEqual({ ok: false, message: DEFAULT_SIGN_IN_ERROR });
	});

	it('an error without a message falls back to the default message', () => {
		expect(signInOutcome({ error: { status: 404 } })).toEqual({
			ok: false,
			message: DEFAULT_SIGN_IN_ERROR
		});
	});

	it('an empty response (no error field at all) is treated as success, not failure', () => {
		expect(signInOutcome({})).toEqual({ ok: true });
	});
});
