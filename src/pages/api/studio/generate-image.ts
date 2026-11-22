import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hasUser, json, requireStudioUser, verifySameOrigin } from "./_shared";

const MODEL = "cx/gpt-image-2";
const MAX_IMAGES_PER_DAY = 10;
const MAX_REFERENCE_BYTES = 6 * 1024 * 1024;
type Scene = { id: string; title: string; script?: string; action?: string; visual?: string; continuityIn?: string; continuityOut?: string; image?: string; referenceImage?: string };
type Project = { id: string; title: string; brief?: string; ratio?: string; character?: string; product?: string; scenes: Scene[] };

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

function decodeImage(value: unknown): { bytes: Uint8Array; mimeType: string } | null {
	if (typeof value !== "string") return null;
	const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
	if (!match) return null;
	try { return { bytes: Uint8Array.from(atob(match[2]!), (char) => char.charCodeAt(0)), mimeType: match[1]!.toLowerCase() }; }
	catch { return null; }
}

export const POST: APIRoute = async ({ request, locals }) => {
	const user = requireStudioUser(locals);
	if (!hasUser(user)) return user;
	if (!verifySameOrigin(request)) return json({ error: "Asal permintaan tidak valid." }, 403);
	if (!env.NINEROUTER_API_KEY) return json({ error: "Secret NINEROUTER_API_KEY belum dipasang di Worker." }, 503);
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

	const prompt = [
		`Create one realistic storyboard still for a ${project.ratio || "9:16"}-aspect video scene.`,
		`Project: ${project.title}. ${project.brief || ""}`,
		project.character && `Character identity lock: ${project.character}`,
		project.product && `Product and visual style lock: ${project.product}`,
		`Scene: ${scene.title}.`,
		scene.script && `Dialogue or narration: ${scene.script}`,
		scene.action && `Main action: ${scene.action}`,
		scene.visual && `Composition, camera, lighting: ${scene.visual}`,
		scene.continuityIn && `Starting continuity: ${scene.continuityIn}`,
		scene.continuityOut && `Ending continuity: ${scene.continuityOut}`,
		"Create a single clear moment with natural human anatomy and believable product details. Preserve identity, clothing, setting, and product shown in supplied references. Do not add lettering, captions, watermarks, or invented logos."
	].filter(Boolean).join("\n\n");
	const referenceImages: Array<{ bytes: Uint8Array; mimeType: string }> = [];
	for (const url of [...new Set([scene.referenceImage, sceneIndex > 0 ? project.scenes[sceneIndex - 1]?.image : undefined].filter((value): value is string => Boolean(value)))].slice(0, 2)) {
		const id = assetIdFromUrl(url);
		if (!id) continue;
		const asset = await db.prepare("SELECT object_key, content_type, byte_size FROM studio_assets WHERE id = ? AND project_id = ? AND owner_id = ?")
			.bind(id, project.id, user.id).first<{ object_key: string; content_type: string; byte_size: number }>();
		if (!asset || asset.byte_size > MAX_REFERENCE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(asset.content_type)) continue;
		const object = await env.MEDIA.get(asset.object_key);
		if (!object || object.size > MAX_REFERENCE_BYTES) continue;
		referenceImages.push({ bytes: new Uint8Array(await object.arrayBuffer()), mimeType: asset.content_type });
	}

	let providerResponse: Response;
	try {
		const baseUrl = (env.NINEROUTER_BASE_URL || "https://9routers.vpsarenka.site").replace(/\/+$/, "");
		providerResponse = await fetch(`${baseUrl}/v1/images/generations`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.NINEROUTER_API_KEY}` },
			body: JSON.stringify({ model: MODEL, prompt, size: "1024x1536", quality: "high", output_format: "png", response_format: "b64_json", ...(referenceImages.length ? { images: referenceImages.map((image) => ({ image_url: `data:${image.mimeType};base64,${asBase64(image.bytes)}` })) } : {}) }),
			signal: AbortSignal.timeout(120_000),
		});
	} catch {
		return json({ error: "9Router tidak merespons. Proyek dan referensi Anda tetap tersimpan." }, 502);
	}
	if (!providerResponse.ok) {
		const status = providerResponse.status === 429 ? 429 : 502;
		return json({ error: status === 429 ? "Kuota atau rate limit Codex di 9Router tercapai." : `9Router menolak permintaan gambar (HTTP ${providerResponse.status}). Pastikan model ${MODEL} tersedia pada koneksi Codex.` }, status);
	}
	let result: { data?: Array<{ b64_json?: string; url?: string }> };
	try { result = await providerResponse.json() as typeof result; }
	catch { return json({ error: "Respons gambar dari 9Router tidak dapat dibaca." }, 502); }
	const generated = result.data?.[0];
	const decoded = decodeImage(generated?.b64_json);
	if (!decoded || decoded.bytes.length < 1 || decoded.bytes.length > 12 * 1024 * 1024) {
		return json({ error: "9Router tidak mengembalikan gambar base64 yang valid. Pastikan model gambar Codex mendukung format OpenAI Images." }, 502);
	}
	const extension = decoded.mimeType === "image/jpeg" ? "jpg" : decoded.mimeType === "image/webp" ? "webp" : "png";
	const assetId = crypto.randomUUID();
	const objectKey = `storyboard/${user.id}/${project.id}/generated-${assetId}.${extension}`;
	await env.MEDIA.put(objectKey, decoded.bytes, { httpMetadata: { contentType: decoded.mimeType } });
	const imageUrl = `/api/studio/assets/${assetId}`;
	project.scenes[sceneIndex] = { ...scene, image: imageUrl };
	try {
		await db.batch([
			db.prepare("INSERT INTO studio_assets (id, project_id, owner_id, object_key, content_type, asset_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)")
				.bind(assetId, project.id, user.id, objectKey, decoded.mimeType, decoded.bytes.length, new Date().toISOString()),
			db.prepare("UPDATE studio_projects SET data_json = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
				.bind(JSON.stringify(project), new Date().toISOString(), project.id, user.id),
		]);
	} catch {
		await env.MEDIA.delete(objectKey);
		return json({ error: "Gambar terbentuk tetapi gagal disimpan ke D1/R2. Coba ulangi." }, 500);
	}
	return json({ imageUrl, model: MODEL });
};
