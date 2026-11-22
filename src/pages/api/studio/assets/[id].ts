import type { APIRoute } from "astro";
import { hasUser, json, requireStudioUser, studioEnv } from "../_shared";

export const GET: APIRoute = async ({ locals, params }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	const id = params.id ?? "";
	if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Gambar tidak ditemukan." }, 404);
	const row = await studioEnv().DB.prepare("SELECT object_key, content_type FROM studio_assets WHERE id = ? AND owner_id = ?")
		.bind(id, user.id).first<{ object_key: string; content_type: string }>();
	if (!row) return json({ error: "Gambar tidak ditemukan." }, 404);
	const object = await studioEnv().MEDIA.get(row.object_key);
	if (!object) return json({ error: "File gambar tidak tersedia." }, 404);
	return new Response(object.body, { headers: {
		"Content-Type": row.content_type,
		"Content-Length": String(object.size),
		"Cache-Control": "private, max-age=3600",
		"X-Content-Type-Options": "nosniff",
	} });
};
