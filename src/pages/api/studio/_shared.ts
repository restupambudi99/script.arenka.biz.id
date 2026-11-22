import { hasPermission } from "@emdash-cms/auth";
import { env } from "cloudflare:workers";

export function json(data: unknown, status = 200): Response {
	return Response.json(data, {
		status,
		headers: { "Cache-Control": "private, no-store" },
	});
}

export function requireStudioUser(locals: App.Locals):
	| { id: string }
	| Response {
	const user = locals.user;
	if (!user) return json({ error: "Silakan masuk ke admin Arenka terlebih dahulu." }, 401);
	if (!hasPermission(user, "content:edit_any")) {
		return json({ error: "Akses studio memerlukan izin editor." }, 403);
	}
	return { id: user.id };
}

export function hasUser(value: { id: string } | Response): value is { id: string } {
	return !(value instanceof Response);
}

export function verifySameOrigin(request: Request): boolean {
	const origin = request.headers.get("Origin");
	return origin !== null && origin === new URL(request.url).origin;
}

export function studioEnv() {
	return env;
}

export function publicProject(value: unknown): unknown {
	if (!value || typeof value !== "object") return value;
	const project = value as Record<string, unknown>;
	if (!Array.isArray(project.scenes)) return project;
	return {
		...project,
		scenes: project.scenes.map((scene) => {
			if (!scene || typeof scene !== "object") return scene;
			const item = { ...(scene as Record<string, unknown>) };
			for (const field of ["image", "referenceImage"] as const) {
				if (typeof item[field] === "string" && (item[field] as string).startsWith("data:")) delete item[field];
			}
			return item;
		}),
	};
}
