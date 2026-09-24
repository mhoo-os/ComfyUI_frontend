# ComfyUI + Higgsfield deployment

Job: `comfyui-frontend-fork-20260924`. Coordinator: `01a0d397-6425-75f2-8207-47cfc7038c91`.
Repository: `/Users/mhoooo/projects/mhoo-os/ComfyUI_frontend`; branch `codex/higgsfield-pages`.
User authorized deployment first, iterative use, and a final Higgsfield API versus ComfyUI capability gap report.

Live frontend: Cloudflare Pages project `mhoo-comfy`.
Owner entry: `https://mhoo.dev/00/comfy/`, existing `/00/*` Cloudflare Access protection and owner JWT validation.
Adapter: Worker `mhoo-comfy`, Durable Object `ComfyJobs`, KV `COMFY_STATE`.
Existing Secrets Store `HF_CREDENTIALS` binding; secret values never copied into source or browser.
The existing Design Studio provider Worker and preview are unchanged.
No remote hot-refresh preview has been configured for this app; production is deployed from the branch's `dist/`.

Verified: full frontend build/typecheck, 11 adapter boundary tests, adapter typecheck, dry-run bundle; signed-in canvas renders the SOUL node; anonymous app/API requests redirect to Access. Authenticated SOUL estimate is USD 0.004 for one 720p image.
Live smoke job completed once: `31f69f4d-4a30-4438-b5a1-50b3ebd9236a`. Provider request f79b204c-c574-467c-8c46-4ad4d647831d completed with one image in ~206 seconds. The generated image was visually verified in the native ComfyUI gallery. Saved workflow reopening and history persistence after reload were verified.

Adapter tests: 16/16 pass, including real Miniflare lifecycle/storage tests with a simulated provider. Full frontend build/typecheck and lint pass (upstream lint warnings); independent adapter review found no remaining deploy blocker. Latest Worker version: 0e883f53-3fd9-4a39-9361-9cae3bf07087. Pages deployment: https://7164f786.mhoo-comfy.pages.dev. Capability report: CAPABILITY-GAPS.md. Next: commit/push and attach PR; iterate on uploads, permanent media retention and live video acceptance.
Delivery Room metadata save failed with `DELIVERY_ROOM_REQUEST_UNCONFIRMED` at revision 1; intent/acceptance/worktree update is pending. No Linear issue is linked. This checkpoint preserves the continuation rather than retrying Room access.
