import type { APIRoute } from "astro";
import { hasUser, json, requireStudioUser, studioEnv } from "../_shared";

export const GET: APIRoute = ({ locals }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	return (async () => {
		const { results } = await studioEnv().DB.prepare(
			"SELECT id, title, updated_at AS updatedAt FROM studio_projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50",
		).bind(user.id).all<{ id: string; title: string; updatedAt: string }>();
		return json({ projects: results });
	})();
};

export const OPTIONS: APIRoute = () => new Response(null, {
	status: 204,
	headers: { Allow: "GET, OPTIONS", "Cache-Control": "no-store" },
});
