import type { APIRoute } from "astro";
import { hasUser, json, requireStudioUser, studioEnv, verifySameOrigin } from "../_shared";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const types = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export const POST: APIRoute = async ({ request, locals }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	if (!verifySameOrigin(request)) return json({ error: "Asal permintaan tidak valid." }, 403);
	const bodyBytes = Number(request.headers.get("content-length") ?? 0);
	if (bodyBytes > MAX_FILE_BYTES + 128_000) return json({ error: "Ukuran unggahan maksimum 8 MB." }, 413);
	let form: FormData;
	try { form = await request.formData(); }
	catch { return json({ error: "Form unggahan tidak valid." }, 400); }
	const projectId = String(form.get("projectId") ?? "");
	const file = form.get("file");
	if (!/^[0-9a-f-]{36}$/i.test(projectId) || !(file instanceof File)) return json({ error: "File atau proyek tidak valid." }, 400);
	if (file.size < 1 || file.size > MAX_FILE_BYTES) return json({ error: "Ukuran gambar maksimum 8 MB." }, 413);
	const extension = types.get(file.type);
	if (!extension) return json({ error: "Format yang didukung: JPEG, PNG, atau WebP." }, 415);
	const db = studioEnv().DB;
	const project = await db.prepare("SELECT id FROM studio_projects WHERE id = ? AND owner_id = ?")
		.bind(projectId, user.id).first();
	if (!project) return json({ error: "Simpan proyek dengan akun editor sebelum mengunggah gambar." }, 404);
	const assetId = crypto.randomUUID();
	const objectKey = `storyboard/${user.id}/${projectId}/${assetId}.${extension}`;
	await studioEnv().MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
	try {
		await db.prepare("INSERT INTO studio_assets (id, project_id, owner_id, object_key, content_type, asset_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, 'reference', ?, ?)")
			.bind(assetId, projectId, user.id, objectKey, file.type, file.size, new Date().toISOString()).run();
	} catch (error) {
		await studioEnv().MEDIA.delete(objectKey);
		throw error;
	}
	return json({ id: assetId, url: `/api/studio/assets/${assetId}` });
};
