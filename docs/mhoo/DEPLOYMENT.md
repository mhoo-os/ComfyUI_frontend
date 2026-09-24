# Deployment and operation

Repository: `mhoo-os/ComfyUI_frontend`. Owner entry: https://mhoo.dev/00/comfy/.

## Build and release

Use the upstream pinned pnpm version and Node engine from `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build:higgsfield
pnpm test:higgsfield
pnpm typecheck:higgsfield
pnpm lint
pnpm exec knip
pnpm deploy:higgsfield:assets
pnpm deploy:higgsfield:api
```

`build:higgsfield` keeps the normal upstream build and changes only the starter workflow under `VITE_HIGGSFIELD=true`. Pages hosts `dist/`; its production branch is `main` for direct asset deployment. The Worker config is `cloudflare/wrangler.jsonc`. The route uses existing `/00/*` Access protection, verifies the JWT audience/issuer and owner email, and rejects cross-origin mutations. No provider keys belong in Vite variables or frontend code.

Regenerate binding declarations after configuration changes:

```sh
pnpm exec wrangler types cloudflare/worker-configuration.d.ts --config cloudflare/wrangler.jsonc --include-runtime=false
```

## Adapter

`cloudflare/models.json` records selected fields from official model-specific schemas. `graph.ts` validates the entire graph before any paid submission. The job Durable Object serializes the owner queue, persists request IDs, polls through alarms and publishes native ComfyUI events. A cancel request marks durable intent; the alarm owns provider transitions. The single-owner UI uses native ComfyUI `/jobs`, `/object_info`, `/prompt`, `/userdata`, `/settings`, `/view` and WebSocket contracts.

Provider request IDs and last polling errors are visible in authenticated job details. No provider response headers or credentials are returned. Successful empty cancellation responses are handled without JSON parsing. Creating a generation is never automatically retried, including on ambiguous transport failure.

The runtime tests use isolated Miniflare storage and a simulated provider with test-only credentials. They do not reach Higgsfield or spend credits.

## Rollback

List the Worker deployment versions with `pnpm exec wrangler versions list --config cloudflare/wrangler.jsonc`, inspect the intended version, and use Wrangler rollback for a confirmed prior deployment. Pages retains separate deployments; redeploy a known-good matching `dist/` build. Do not delete the Durable Object namespace or KV namespace during rollback: they contain workflows and paid job state.

## Limitations

See [CAPABILITY-GAPS.md](CAPABILITY-GAPS.md). This is an owner-only iterative release, not a full ComfyUI execution server. The initial local build passed on Node 24.16.0 with the upstream Node 26 engine warning; use the declared engine in CI/future reproducible environments. Lint passes with upstream warnings.
