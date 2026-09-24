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

Adapter tests: 16/16 pass, including real Miniflare lifecycle/storage tests with a simulated provider. Full frontend build/typecheck and lint pass (upstream lint warnings); independent adapter review found no remaining deploy blocker. Latest Worker version: b5b77ed9-c656-45bc-8118-de0924abf3b8. Pages deployment: https://7164f786.mhoo-comfy.pages.dev. Capability report: CAPABILITY-GAPS.md. Source commit: `019ef2a`. Changes pushed to `origin/codex/higgsfield-pages`. Next: iterate on uploads, permanent media retention and live video acceptance.
Delivery Room metadata save failed with `DELIVERY_ROOM_REQUEST_UNCONFIRMED` at revision 1; intent/acceptance/worktree update is pending. No Linear issue is linked. This checkpoint preserves the continuation rather than retrying Room access.

## Reference pipeline continuation — 24 September 2026

User requested closing practical gaps and testing end to end with a professional creator reference; delegated reference selection to us. Selected Nathan Dumlao's licensed Unsplash coffee photo (`zUNs99PGDg0`). Added Marketing Studio reference editing, Seedance end-image links, native bounded image upload, per-node cost estimates, provider-aware status beside Run, and private `mhoo-comfy-media` R2 archival/playback. Unrelated Comfy Login and Model Library are hidden only in Higgsfield builds.

Live Worker version: `7a6808f1-2ee3-4fad-b5ab-44543cb20f5e`. Final Pages deployment: https://a0074be5.mhoo-comfy.pages.dev. Native workflow: `Coffee campaign — Nathan Dumlao reference` (three nodes, three links). Portable JSON is in `docs/mhoo/workflows/coffee-campaign.json`. The live copy uses an uploaded reference; portable copy uses the stable public original. Native upload, provider estimate, graph input serialization and saved workflow retrieval verified. No browser errors observed.

19 adapter tests pass, including upload credential/header isolation, R2 range reads, reference→image→video chaining and both transient/permanent archival failures without duplicate paid submissions. Full frontend build/typecheck, Worker typecheck, lint (199 existing warnings), Knip, formatting and independent review passed. Reviewer reported no blockers after defaults/retry-counter fixes.

Paid E2E is NOT complete. First keyframe estimate USD 0.042; four-second 720p video estimate is a token-pricing explanation (~USD 1.85 before discounts at 1280×720). Asked user to authorize a $5 total cap for the three-node connected test plus one text-to-video check (alternative $2 connected-only). Their earlier reply chose reference selection but did not specify a cap; spending question remains pending. No paid requests submitted in this continuation. Once answered, run the saved graph through native Run, inspect every image and video, verify R2-backed authenticated range playback/history after reload, then update the evidence and PR. Do not silently retry failed/ambiguous paid submissions.

Delivery Room metadata update remains pending under the same existing job/revision; do not repeat failed authentication/save loops. No Linear issue linked. Production and preview routes/ownership are unchanged from above; no hot-refresh preview exists for ComfyUI.

Implementation committed and pushed as `c715134`; PR https://github.com/mhoo-os/ComfyUI_frontend/pull/1. Native saved workflow also verified after reload. Anonymous jobs API returns Access 302.
