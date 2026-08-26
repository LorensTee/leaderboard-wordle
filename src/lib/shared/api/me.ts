// Phase-2 typed profile API surface for the client (Hono RPC — wire types
// flow from the server's AppType through `res.json()`; nothing hand-declared).
// TanStack Query calls these functions (`['me']` + profile mutation, D8).
import { api, apiErrorFromResponse } from './client';
import type { MeUser } from '$server/profile/service';
import type { ProfileBody } from '$server/profile/handlers';

export const meKeys = {
	all: ['me'] as const
};

export const meApi = {
	/** GET /api/me — the authenticated user's public profile. */
	async getMe(): Promise<MeUser> {
		const res = await api.api.me.$get();
		if (!res.ok) throw await apiErrorFromResponse(res);
		return (await res.json()).user;
	},

	/** PATCH /api/me/profile — onboarding (both fields) or post-onboarding edits. */
	async updateProfile(patch: ProfileBody): Promise<MeUser> {
		const res = await api.api.me.profile.$patch({ json: patch });
		if (!res.ok) throw await apiErrorFromResponse(res);
		return (await res.json()).user;
	}
};