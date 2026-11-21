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
			if (url.pathname.startsWith("/_emdash")) {
				return Response.redirect(`https://arenka.biz.id${url.pathname}${url.search}`, 302);
			}
		}
		return handler.fetch(request, env, ctx);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler<Env>;
