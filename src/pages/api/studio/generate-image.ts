import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hasUser, json, requireStudioUser, verifySameOrigin } from "./_shared";

const MODEL = "gemini-nano-banana-2.1";
const MAX_IMAGES_PER_DAY = 10;
const MAX_REFERENCE_BYTES = 6 * 1024 * 1024;
type Scene = { id: string; title: string; script?: string; action?: string; visual?: string; continuityIn?: string; continuityOut?: string; image?: string; referenceImage?: string };
type Project = { id: string; title: string; brief?: string; ratio?: string; scenes: Scene[] };

function assetIdFromUrl(value?: string) {
	const match = value?.match(/^\/api\/studio\/assets\/([0-9a-f-]{36})$/i);
	return match?.[1];
}

function asBase64(bytes: Uint8Array) {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
	}
	return btoa(binary);
}

export const POST: APIRoute = async ({ request, locals }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	if (!verifySameOrigin(request)) return json({ error: "Asal permintaan tidak valid." }, 403);
	if (!env.GEMINI_API_KEY) return json({ error: "Tambahkan GEMINI_API_KEY sebagai secret Worker untuk mengaktifkan pembuatan gambar." }, 503);
	let body: { projectId?: string; sceneId?: string };
	try { body = await request.json() as typeof body; } catch { return json({ error: "Permintaan tidak valid." }, 400); }
	if (!/^[0-9a-f-]{36}$/i.test(body.projectId ?? "") || typeof body.sceneId !== "string" || body.sceneId.length > 100) {
		return json({ error: "Proyek atau scene tidak valid." }, 400);
	}
	const db = env.DB;
	const row = await db.prepare("SELECT data_json FROM studio_projects WHERE id = ? AND owner_id = ?")
		.bind(body.projectId!, user.id).first<{ data_json: string }>();
	if (!row) return json({ error: "Simpan proyek ke D1 sebelum membuat gambar." }, 404);
	let project: Project;
	try { project = JSON.parse(row.data_json) as Project; }
	catch { return json({ error: "Data proyek tidak dapat dibaca." }, 500); }
	const sceneIndex = project.scenes.findIndex((scene) => scene.id === body.sceneId);
	if (sceneIndex < 0) return json({ error: "Scene tidak ditemukan." }, 404);
	const scene = project.scenes[sceneIndex]!;
	const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const count = await db.prepare("SELECT COUNT(*) AS total FROM studio_generation_events WHERE owner_id = ? AND created_at > ?")
		.bind(user.id, cutoff).first<{ total: number }>();
	if (Number(count?.total ?? 0) >= MAX_IMAGES_PER_DAY) return json({ error: "Batas harian 10 gambar per akun tercapai. Coba lagi setelah kuota harian bergulir." }, 429);
	await db.prepare("INSERT INTO studio_generation_events (id, owner_id, project_id, scene_id, created_at) VALUES (?, ?, ?, ?, ?)")
		.bind(crypto.randomUUID(), user.id, project.id, scene.id, new Date().toISOString()).run();

	const input: Array<Record<string, string>> = [];
	const prompt = [
		`Create one realistic storyboard still for a ${project.ratio || "9:16"}-aspect video scene.`,
		`Project: ${project.title}. ${project.brief || ""}`,
		`Scene: ${scene.title}.`,
		scene.script && `Dialogue or narration: ${scene.script}`,
		scene.action && `Main action: ${scene.action}`,
		scene.visual && `Composition, camera, lighting: ${scene.visual}`,
		scene.continuityIn && `Starting continuity: ${scene.continuityIn}`,
		scene.continuityOut && `Ending continuity: ${scene.continuityOut}`,
		"Create a single clear moment with natural human anatomy and believable product details. Preserve the identity, clothing, setting, and product shown in the supplied reference images. Do not add lettering, captions, watermarks, or invented logos."
	].filter(Boolean).join("\n\n");
	input.push({ type: "text", text: prompt });
	const referenceUrls = [scene.referenceImage, sceneIndex > 0 ? project.scenes[sceneIndex - 1]?.image : undefined].filter((value): value is string => Boolean(value));
	for (const url of [...new Set(referenceUrls)].slice(0, 2)) {
		const id = assetIdFromUrl(url);
		if (!id) continue;
		const asset = await db.prepare("SELECT object_key, content_type, byte_size FROM studio_assets WHERE id = ? AND project_id = ? AND owner_id = ?")
			.bind(id, project.id, user.id).first<{ object_key: string; content_type: string; byte_size: number }>();
		if (!asset || asset.byte_size > MAX_REFERENCE_BYTES) continue;
		const object = await env.MEDIA.get(asset.object_key);
		if (!object || object.size > MAX_REFERENCE_BYTES) continue;
		input.push({ type: "image", mime_type: asset.content_type, data: asBase64(new Uint8Array(await object.arrayBuffer())) });
	}

	let providerResponse: Response;
	try {
		providerResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY, "Api-Revision": "2026-05-20" },
			body: JSON.stringify({ model: MODEL, input }),
			signal: AbortSignal.timeout(90_000),
		});
	} catch {
		return json({ error: "Layanan Gemini tidak merespons. Gambar dan proyek Anda tetap tersimpan." }, 502);
	}
	if (!providerResponse.ok) {
		const status = providerResponse.status === 429 ? 429 : providerResponse.status === 401 || providerResponse.status === 403 ? 502 : 502;
		return json({ error: status === 429 ? "Kuota atau rate limit Gemini tercapai." : "Gemini menolak permintaan. Periksa secret dan akses model pada akun Google AI." }, status);
	}
	let result: { output_image?: { data?: string; mime_type?: string }; output?: Array<{ type?: string; data?: string; mime_type?: string }> };
	try { result = await providerResponse.json() as typeof result; }
	catch { return json({ error: "Respons Gemini tidak dapat dibaca." }, 502); }
	const generated = result.output_image ?? result.output?.find((item) => item.type === "image");
	if (!generated?.data || !generated.mime_type || !["image/png", "image/jpeg", "image/webp"].includes(generated.mime_type)) {
		return json({ error: "Gemini tidak mengembalikan gambar. Coba sederhanakan arahan scene." }, 502);
	}
	let bytes: Uint8Array;
	try { bytes = Uint8Array.from(atob(generated.data), (char) => char.charCodeAt(0)); }
	catch { return json({ error: "Data gambar dari Gemini tidak valid." }, 502); }
	if (bytes.length < 1 || bytes.length > 12 * 1024 * 1024) return json({ error: "Ukuran gambar hasil berada di luar batas aman." }, 502);
	const extension = generated.mime_type === "image/jpeg" ? "jpg" : generated.mime_type === "image/webp" ? "webp" : "png";
	const assetId = crypto.randomUUID();
	const objectKey = `storyboard/${user.id}/${project.id}/generated-${assetId}.${extension}`;
	await env.MEDIA.put(objectKey, bytes, { httpMetadata: { contentType: generated.mime_type } });
	const imageUrl = `/api/studio/assets/${assetId}`;
	project.scenes[sceneIndex] = { ...scene, image: imageUrl };
	try {
		await db.batch([
			db.prepare("INSERT INTO studio_assets (id, project_id, owner_id, object_key, content_type, asset_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)")
				.bind(assetId, project.id, user.id, objectKey, generated.mime_type, bytes.length, new Date().toISOString()),
			db.prepare("UPDATE studio_projects SET data_json = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
				.bind(JSON.stringify(project), new Date().toISOString(), project.id, user.id),
		]);
	} catch {
		await env.MEDIA.delete(objectKey);
		return json({ error: "Gambar terbentuk tetapi gagal disimpan ke D1/R2. Coba ulangi." }, 500);
	}
	return json({ imageUrl, model: MODEL });
};
