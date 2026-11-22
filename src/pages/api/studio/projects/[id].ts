import type { APIRoute } from "astro";
import { hasUser, json, publicProject, requireStudioUser, studioEnv, verifySameOrigin } from "../_shared";

const MAX_PROJECT_BYTES = 180_000;
const idPattern = /^[0-9a-f-]{36}$/i;

export const GET: APIRoute = async ({ locals, params }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	const id = params.id ?? "";
	if (!idPattern.test(id)) return json({ error: "ID proyek tidak valid." }, 400);
	const row = await studioEnv().DB.prepare(
		"SELECT data_json FROM studio_projects WHERE id = ? AND owner_id = ?",
	).bind(id, user.id).first<{ data_json: string }>();
	if (!row) return json({ error: "Proyek tidak ditemukan." }, 404);
	try { return json({ project: JSON.parse(row.data_json) }); }
	catch { return json({ error: "Data proyek tidak dapat dibaca." }, 500); }
};

export const PUT: APIRoute = async ({ request, locals, params }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	if (!verifySameOrigin(request)) return json({ error: "Asal permintaan tidak valid." }, 403);
	const id = params.id ?? "";
	if (!idPattern.test(id)) return json({ error: "ID proyek tidak valid." }, 400);
	const length = Number(request.headers.get("content-length") ?? 0);
	if (length > MAX_PROJECT_BYTES) return json({ error: "Proyek melebihi batas 180 KB." }, 413);
	let incoming: Record<string, unknown>;
	try {
		const body = await request.json() as Record<string, unknown>;
		if (JSON.stringify(body).length > MAX_PROJECT_BYTES) return json({ error: "Proyek melebihi batas 180 KB." }, 413);
		if (body.id !== id || !Array.isArray(body.scenes) || body.scenes.length > 80) return json({ error: "Struktur proyek tidak valid." }, 400);
		incoming = publicProject(body) as Record<string, unknown>;
	} catch { return json({ error: "Isi proyek tidak valid." }, 400); }
	const db = studioEnv().DB;
	const existing = await db.prepare("SELECT created_at FROM studio_projects WHERE id = ? AND owner_id = ?")
		.bind(id, user.id).first<{ created_at: string }>();
	const now = new Date().toISOString();
	if (existing) {
		await db.prepare("UPDATE studio_projects SET title = ?, data_json = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
			.bind(String(incoming.title ?? "Proyek storyboard").slice(0, 120), JSON.stringify(incoming), now, id, user.id).run();
	} else {
		const collision = await db.prepare("SELECT id FROM studio_projects WHERE id = ?").bind(id).first();
		if (collision) return json({ error: "Proyek tidak ditemukan." }, 404);
		await db.prepare("INSERT INTO studio_projects (id, owner_id, title, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
			.bind(id, user.id, String(incoming.title ?? "Proyek storyboard").slice(0, 120), JSON.stringify(incoming), now, now).run();
	}
	return json({ ok: true, updatedAt: now });
};

export const DELETE: APIRoute = async ({ request, locals, params }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	if (!verifySameOrigin(request)) return json({ error: "Asal permintaan tidak valid." }, 403);
	const id = params.id ?? "";
	if (!idPattern.test(id)) return json({ error: "ID proyek tidak valid." }, 400);
	const db = studioEnv().DB;
	const assets = await db.prepare("SELECT object_key FROM studio_assets WHERE project_id = ? AND owner_id = ?")
		.bind(id, user.id).all<{ object_key: string }>();
	for (const asset of assets.results) await studioEnv().MEDIA.delete(asset.object_key);
	await db.prepare("DELETE FROM studio_projects WHERE id = ? AND owner_id = ?").bind(id, user.id).run();
	return json({ ok: true });
};
