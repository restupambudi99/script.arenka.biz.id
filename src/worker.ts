import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

export { PluginBridge };

export default {
	...handler,
	async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		if (url.hostname === "script.arenka.biz.id") {
			if (url.pathname === "/") {
				return Response.redirect(`${url.origin}/generator`, 302);
			}
			if (url.pathname === "/api/script-generate") {
				return generateScript(request, env);
			}
			if (url.pathname.startsWith("/_emdash")) {
				return Response.redirect(`https://arenka.biz.id${url.pathname}${url.search}`, 302);
			}
		}
		return handler.fetch(request, env, ctx);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler<Env>;

async function generateScript(request: Request, env: Env): Promise<Response> {
	if (request.method !== "POST") return Response.json({ error: "Metode tidak didukung." }, { status: 405 });
	if (request.headers.get("origin") !== "https://script.arenka.biz.id") {
		return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
	}
	if (Number(request.headers.get("content-length") || 0) > 16000) {
		return Response.json({ error: "Prompt terlalu panjang." }, { status: 413 });
	}
	let body: unknown;
	try { body = await request.json(); } catch { return Response.json({ error: "Format permintaan tidak valid." }, { status: 400 }); }
	const prompt = typeof body === "object" && body !== null && "prompt" in body ? body.prompt : undefined;
	if (typeof prompt !== "string" || prompt.length < 20 || prompt.length > 12000) {
		return Response.json({ error: "Prompt harus berisi 20–12.000 karakter." }, { status: 400 });
	}
	const ip = request.headers.get("CF-Connecting-IP") || "unknown";
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
	const key = `script-ai:${new Date().toISOString().slice(0, 10)}:${Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
	const used = Number(await env.SESSION.get(key) || 0);
	if (used >= 5) return Response.json({ error: "Batas 5 hasil AI per hari untuk koneksi ini sudah tercapai. Coba lagi besok." }, { status: 429 });
	await env.SESSION.put(key, String(used + 1), { expirationTtl: 86400 });
	try {
		const response = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
			messages: [
				{ role: "system", content: "Anda penulis konten pemasaran Indonesia. Ikuti instruksi pengguna, berikan hasil siap pakai tanpa pengantar. Jangan mengarang fakta, angka, atau testimoni." },
				{ role: "user", content: prompt },
			],
			chat_template_kwargs: { enable_thinking: false },
			max_tokens: 3000,
		});
		const result = "response" in response ? response.response : undefined;
		if (typeof result !== "string" || !result.trim()) throw new Error("Empty AI response");
		return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		console.error(JSON.stringify({ event: "script_ai_error", message: error instanceof Error ? error.message : "unknown" }));
		return Response.json({ error: "Layanan AI sedang tidak tersedia atau kuota harian sudah habis. Prompt tetap dapat disalin." }, { status: 503 });
	}
}
