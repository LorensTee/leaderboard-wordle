// SvelteKit ↔ Hono bridge — the single platform boundary (Architecture §240).
// This file ONLY translates the platform request into Hono's environment.
// Game logic, database queries, and authorization never live here.
import type { RequestHandler } from './$types';
import app, { type HonoBindings } from '$server/routes';

const bridge: RequestHandler = ({ request, platform }) => {
	// Platform bindings → Hono environment. The cast is confined to this
	// boundary (Architecture §998: only this layer translates them).
	const bindings = platform?.env as unknown as HonoBindings | undefined;
	return app.fetch(request, bindings ?? ({} as HonoBindings), platform?.ctx);
};

export const GET = bridge;
export const POST = bridge;
export const PUT = bridge;
export const PATCH = bridge;
export const DELETE = bridge;
export const OPTIONS = bridge;
export const HEAD = bridge;
