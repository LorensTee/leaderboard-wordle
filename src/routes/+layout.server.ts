// Layout-level session resolution for page composition (Architecture §Auth
// ownership: hooks.server.ts → event.locals drives PAGE behavior only; Hono
// authenticates the API independently).
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user
	};
};