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

Live Worker version: `7a6808f1-2ee3-4fad-b5ab-44543cb20f5e`. Final Pages deployment: https://8db2dc19.mhoo-comfy.pages.dev. Native workflow: `Coffee campaign — Nathan Dumlao reference` (three nodes, three links). Portable JSON is in `docs/mhoo/workflows/coffee-campaign.json`. The live copy uses an uploaded reference; portable copy uses the stable public original. Native upload, provider estimate, graph input serialization and saved workflow retrieval verified. No browser errors observed.

19 adapter tests pass, including upload credential/header isolation, R2 range reads, reference→image→video chaining and both transient/permanent archival failures without duplicate paid submissions. Full frontend build/typecheck, Worker typecheck, lint (199 existing warnings), Knip, formatting and independent review passed. Reviewer reported no blockers after defaults/retry-counter fixes.

Paid E2E is NOT complete. First keyframe estimate USD 0.042; four-second 720p video estimate is a token-pricing explanation (~USD 1.85 before discounts at 1280×720). Asked user to authorize a $5 total cap for the three-node connected test plus one text-to-video check (alternative $2 connected-only). Their earlier reply chose reference selection but did not specify a cap; spending question remains pending. No paid requests submitted in this continuation. Once answered, run the saved graph through native Run, inspect every image and video, verify R2-backed authenticated range playback/history after reload, then update the evidence and PR. Do not silently retry failed/ambiguous paid submissions.

Delivery Room metadata update remains pending under the same existing job/revision; do not repeat failed authentication/save loops. No Linear issue linked. Production and preview routes/ownership are unchanged from above; no hot-refresh preview exists for ComfyUI.

Implementation committed and pushed as `c715134`; PR https://github.com/mhoo-os/ComfyUI_frontend/pull/1. Native saved workflow also verified after reload. Anonymous jobs API returns Access 302.

Follow-up: validated the user-proposed four-stage architecture against current official schemas; see PIPELINE-VALIDATION.md. SOUL Cinema is not arbitrary image-URL refinement; explicit camera/lens/color fields belong to Cinema Studio 4.0 video; Seedance uses singular end_image_url and audio generation/reference support does not guarantee lip-sync. Final reload exposed a node initialization-order issue: node.type is not ready during nodeCreated. Fixed by checking constructor.comfyClass at its unknown runtime boundary; native upload/estimate buttons verified after reloading the final Pages build. Added regression tests for initialization and exclusion of action buttons from provider inputs.

## Canvas finishing continuation — 24 September 2026

User explicitly authorized implementing and deploying FFmpeg on Cloudflare Containers with finishing represented in the canvas. Same Delivery Room job; metadata update remains pending after the previously recorded unconfirmed-room failure. Implementing Production nodes Clip → Sequence → Compose → Export, private media uploads and R2 MP4 outputs. Container uses standard-2 (1 vCPU/6 GiB), max one instance, no outbound internet, one-minute idle shutdown. Existing owner Access remains the entry boundary. Native generation credits not used for renderer acceptance. Prior paid Higgsfield showcase budget remains unresolved. No preview route/hot refresh newly configured.

Figma MCP is unavailable in this tool session; using existing native Comfy node widgets/layout rather than creating new visual primitives. Renderer is an independent module under cloudflare/renderer and could be split into a follow-up PR if review prefers; this delivery integrates it with the existing PR to test the complete path. Reviewer is rechecking the actual finishing diff. Local Linux FFmpeg tests passed; live acceptance pending below.

Finishing delivered: Worker version `f5d1a6d2-ed9d-4b87-a575-24f02b2e4b7e`, Pages https://da91fa12.mhoo-comfy.pages.dev, Container `mhoo-comfy-comfyrenderer`. First registry upload timed out; cached retry succeeded. Reviewer upload-length finding fixed with FixedLengthStream; actual-body mismatch regression passes. Worker typecheck failure in new test fixed with Zod boundary parsing. Static preflight resolves connected edits to reject >120-second timelines before any generation.

User selected ChatGPT built-in image generator instead of authorizing paid Higgsfield runs. Generated coffee still is `docs/mhoo/showcase/coffee-generated.png`; no provider spend. Initial reference-attached imagegen request returned invalid prompt payload; standalone generation succeeded. A local deterministic six-second pan/zoom clip derived from that still was uploaded through native Clip controls (no generative-motion claim).

Live finishing-only job `66acc650-6fc1-4b82-960e-ca7e97a3af06` completed: two three-second trims, 0.3-second fade, caption “A moment, brewed slowly.”, landscape 720p. MP4 is 5.7 seconds, 1280×720, 30 fps, H.264/AAC, 698485 bytes. Native gallery playback visibly confirmed paused=false with advancing currentTime and correct dimensions. R2 authenticated range GET returned 206, bytes 0–1023/698485. Saved workflow “Coffee — finished production showcase” returns 200; local final output `docs/mhoo/showcase/coffee-finished.mp4`. Prior failed live job `6b00f1a2-6375-4519-845e-8400e0b3b39e` exposed R2 loss of known stream length across container proxy; fixed explicit fixed-length response stream and reran successfully.

22 adapter tests pass; two frontend tests, four real Linux FFmpeg tests, full frontend build/typecheck, Worker and renderer typechecks, full lint (199 upstream warnings), changed-file lint, Knip and dry-run pass. Production node connection serialization verified with native graphToPrompt. No public renderer route; no new secrets. Remaining production gaps documented in PRODUCTION-FINISHING.md: embedded drag timeline, timed captions, multi-track audio/ducking, selective generation reuse, immediate mid-render cancellation. Higgsfield paid E2E is explicitly still untested; do not run it under the superseded spending question.

Final release: source commit `4d5f2ef`, Worker `fc582b95-ec6f-4ae2-ba70-4ba3e2f37cb9`, Pages unchanged (`da91fa12`). Pre-commit type-aware checks caught record lookup narrowing and unawaited Node test registrations; fixed the underlying types/awaits and all hooks passed. Final reviewer recheck found no blocker. The mismatch-upload regression uses the test harness to set a false Content-Length internally, because Undici rejects that mismatch before transmission. PR 1 updated to cover generation plus Cloudflare finishing. Anonymous media request still returns Access 302. Saved workflow and finished output verified after browser reload.

## WebMCP and agentic architecture continuation — 24 September 2026

User selected Script-to-Talking Shot as the first complete-stack acceptance
workflow, superseding the proposed batch-ads-first default. Validated corrections
and implementation gaps are in AGENTIC-PRODUCTION.md. Jev/Astra API bindings,
Workflows migration and an exact-speech/lip-sync route are not implemented or
claimed complete. Existing Durable Object remains the only execution runner.
No new provider generation spend was authorized or used.

Implemented feature-detected native WebMCP tools: getCanvasState,
updateNodeParameter, queueCanvasWorkflow (finishing-only), getProductionJob.
Current live browser exposes document.modelContext. Actual native discovery,
caption edit, stale-revision refusal, caption restoration, queue and completed
job read passed. Job 3ec60186-291a-4928-94bd-e97244193a83 completed in 12.23s;
private R2 MP4 appears visibly in native gallery. This verifies browser tool →
existing durable runner → Cloudflare FFmpeg → R2 → preview, not paid talking-shot
generation. No callback injection or public R2 exposure was introduced.

Reviewer identified caller-controlled cost acknowledgment as insufficient;
removed that flag and blocked Higgsfield generation through WebMCP. Native Run
remains available under existing user review. Seven focused tests pass, full
build/typechecks and lint pass (199 upstream warnings), Knip and ADR checks pass.
Delivery Room update remains pending under the previously recorded unconfirmed
request; same job, branch, PR and production ownership. No new preview route.
