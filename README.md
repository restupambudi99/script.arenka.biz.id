# Script Arenka

Arenka's content generator, hosted on Cloudflare Workers at `https://script.arenka.biz.id/generator`. This is a dedicated frontend and API on the same EmDash Worker that serves `https://arenka.biz.id`; it does not replace the CMS.

## Generator modules

- Content Script Engine
- Content Idea Generator
- Hook Generator
- Caption Generator
- Carousel
- Content Plan & Calendar

The UI mirrors the reference generator's six workflows, Indonesian field labels and options, dark sidebar, two-column form/output layout, prompt generation, copy action, reset, theme switch, and AI result view. Source behavior was observed in the authenticated reference app, including required-field validation and prompt output. The site is a clean-room implementation; the reference application's backend, private assets, credentials, and source code are not copied.

## Architecture

- Astro + React app route: `src/pages/generator.astro`
- Form schema and prompt builders: `src/components/script-generator/config.ts`
- Generator UI: `src/components/script-generator/ScriptGenerator.tsx`
- Styles: `src/components/script-generator/script-generator.css`
- Host routing and AI endpoint: `src/worker.ts`
- Cloudflare config: `wrangler.jsonc`
- AI: Cloudflare Workers AI binding `AI`, model `@cf/google/gemma-4-26b-a4b-it`
- Rate limit: KV binding `SESSION`, 5 AI generations per IP per UTC day
- Existing EmDash services remain bound: D1 `arenka-emdash`, R2 `arenka-emdash-media`

The subdomain root redirects to `/generator`. EmDash admin paths on the subdomain redirect to the apex site. The AI endpoint only accepts same-origin POST requests at `/api/script-generate`; it validates the prompt size and returns JSON.

Workers AI has a daily free allocation on Cloudflare Free. See current Cloudflare [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). If the account reaches its free daily limit, the form still allows copying the generated prompt for use in another AI.

## Develop

```powershell
npm install
npm run dev
```

The app's local Astro route can be previewed at `http://localhost:4321/generator`. For the production AI endpoint, deploy on Cloudflare with the configured `AI` binding.

## Typecheck and build

```powershell
npm run typecheck
npm run build
```

## Deploy

Use the `arenkabiz.id@gmail.com` Cloudflare account and its Wrangler OAuth login, then:

```powershell
npm exec wrangler deploy
```

The Worker uses custom domains `arenka.biz.id` and `script.arenka.biz.id`, D1, R2, KV sessions, and Workers AI. The current account ID is `df5ba4fe4d3e63a428fec0550589eb8e`. Never commit `.env`, Wrangler auth files, API tokens, passkeys, or generated migration manifests.

## Handoff notes for the next agent

1. Read this file and `wrangler.jsonc` before editing infrastructure. The project already runs in production; do not create replacement D1/R2/KV resources.
2. Confirm the active GitHub branch and inspect recent history before committing. Deployments are made from this repository's `main` branch.
3. The Cloudflare OAuth token is stored outside the repo in `H:\REA\.wrangler-config\.wrangler\config\default.toml`; do not copy it into files, logs, or chat. Re-authenticate with `wrangler login --no-use-keyring` if needed.
4. Run `npm run typecheck` and `npm run build` before deploying changes. Build may warn that network access to Google Fonts is unavailable; the build can still complete.
5. Runtime AI is billed against the account's Workers AI allocation. Use short, generic prompts for manual smoke checks and avoid repeatedly invoking the model.
6. To change generation fields or prompt rules, update `src/components/script-generator/config.ts`. To change request handling or hostname behavior, edit `src/worker.ts` and `wrangler.jsonc` together.

## Current status

Production generator deployed at `https://script.arenka.biz.id/generator`. Deployment verified that the Worker has AI, KV, D1, R2 and Assets bindings, and the production page loaded with all six modules. The AI button still needs a live smoke check after the current deploy if you want to confirm inference on this Cloudflare account.
