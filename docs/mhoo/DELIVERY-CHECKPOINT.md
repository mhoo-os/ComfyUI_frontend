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

## Talking-shot continuation — 25 September 2026

This supersedes the previous continuation's unimplemented-planner/Workflows
status. Added HiggsfieldTalkingShot with separate scene/dialogue, duration and
format fields; free template mode and optional Jev/Astra mode. Strict compilation
targets verified Seedance 2.5 text-to-video with generate_audio. Exact spoken
wording, lip sync and identity fidelity remain unverified; no Speech2Video route
was invented. Native preview request submits no Higgsfield generation.

User supplied default_codex-lb_default and default_typesafe_default. Metadata
confirmed active AI-Gateway-only secrets in the existing default gateway. Reuse
custom-codex-lb and custom-typesafe paths with default aliases and existing
mhoo_workbench_cf_aig_token gateway authentication; no key extraction, new token
or secret scope changes. Workflows routes/drafts in separate no-retry steps;
ComfyJobs remains the paid-submission ledger/history owner. Other graphs retain
the previous alarm runner. Real local Workflows test covers sleep/poll/archive;
ambiguous-submit regression proves no duplicate paid POST. 38 backend tests pass.
Live deployment and planner acceptance pending below. No new Higgsfield spend.

Live release: Worker 78cbb0c5-5994-4f6a-bd31-efed70c8680a, Pages
https://23d30d7c.mhoo-comfy.pages.dev, Workflow mhoo-comfy-production.
Saved native workflow “Script to Talking Shot”, graph
58405a58-644f-43a9-83ad-1bdfbef17d3b. Free template preview, native button,
WebMCP parameter inspection and workflow save verified. Owner session expired;
reused the existing Google account chooser for tanyawit@mhoooo.com, with no new
grant. Live planner initially failed because Workers rejects fetch redirect
mode error; changed to manual (non-2xx redirects fail closed). Live AI planner
then returned 200: Jev single_speaker confidence 0.84 in 1352ms; Astra scene
expansion in 5808ms. Dialogue remained literal. No Higgsfield paid submission.
The new real-Workflows Jev→Astra→provider test covers runtime fetch semantics
with simulated services. Full-stack paid video acceptance remains outstanding.

## Authorized paid acceptance — 25 September 2026

User explicitly approved one Higgsfield render capped at USD 3 (estimate ~USD
2.31). Switched the saved talking workflow to jev_astra, saved, and clicked native
Run exactly once. Job 6fb05b32-177c-4f81-bc80-46487646541c / provider
a834faf2-480f-4b07-a331-52a5962d3f97 completed in 416.45s. Jev single_speaker
0.99/1093ms, Astra 5666ms. Browser reload during generation preserved the active
job. Private R2 archival and native gallery playback passed. Output 5.041667sec,
1280x720/24fps H264/AAC, 3471622 bytes; local Whisper small transcribed the exact
requested “Your next big idea starts here.” Frame samples show stable character
and speaking motion, but precise lip alignment is not measured and needs human
creative approval. Final billed amount unavailable; no repeat submission.

Completed history verified after reload and authenticated range playback returned
206 bytes 0-1023/3471622. See CAPABILITY-GAPS.md for SHA256 and acceptance detail.
Local analysis files /tmp/comfy-talking-shot.mp4, /tmp/comfy-talking-shot.wav,
/tmp/comfy-talking-transcript.txt, /tmp/comfy-talking-contact.jpg are temporary;
private R2 is the retained output. No code/deployment changes in this acceptance
turn. Existing code checks remain applicable. Independent reviewer confirmed metadata/hash, clean audio/video decoding, exact
transcript and stable sampled character/composition. No release blocker; face
shadow/size limits precise lip-sync assessment from stills.
Delivery Room read succeeded, but metadata remains revision 1 with old fork-only
scope; previous unconfirmed save is still pending, not treated as acceptance.

## Private character reference library — 25 September 2026

Continued job comfyui-frontend-fork-20260924 in the same checkout and branch.
Added authenticated private R2 reference ingestion, DO metadata and revision/ETag
approval, batch review, and a native Vue library dialog on image-input nodes.
No D1, new credentials or public R2 URLs. Limits: 200 photos, 20 MB per image,
20 files per UI upload, 50 per atomic review batch. Magic signature/stream-length
validation does not claim full image decoding. Year can remain unknown; era,
character, subject selection and view are required for approval.

Drafts and stale tokens fail before provider calls; estimate substitutes a dummy
URL without sending bytes. Execution holds a persisted five-minute reference
lease during provider upload/submission. Edits/revokes return 409 while leased;
ambiguous failures keep the lease to expire safely. Revocation blocks future use,
not an already-transmitted provider copy. Saved metadata edits clear approval.
Tokens accepted only in image fields. Group-photo subject text is a prompt hint,
not an identity guarantee; this MVP has no crop editor or Soul training endpoint.
Human keyframe approval remains a separate outstanding production feature.

Evidence: 47 backend tests, 3 UI behavior tests, full typecheck, backend typecheck,
full lint, knip and deployment dry-run pass. Reviewer found transfer/revoke race
and text-field token acceptance; both fixed with regression tests. Existing
capture-year optional behavior retained intentionally (unknown dates must not
be invented). No real photos or paid generations used in automated tests.
Release and live visual verification in progress; not yet claimed delivered.
Delivery Room read/evaluator succeeds but old revision-1 metadata still lacks
steps/evidence/Linear association. Update remains pending after prior
DELIVERY_ROOM_REQUEST_UNCONFIRMED; checkpoint is current evidence.

Live verification completed: Worker e2b5fc89-09b5-4d32-b99a-9d1a736f6439,
Pages https://32b15223.mhoo-comfy.pages.dev. Opened native Marketing Studio node,
confirmed Character references button and dialog. Uploaded one user-confirmed
original privately, saved known subject/era with unknown capture year preserved,
and refreshed successfully. Preview renders, draft status persists and Use in
node is disabled. No provider upload or paid generation was initiated. Personal
asset identity and source details remain in private storage, not this repo.
Library is open for user review. Remaining collection import, cropping, Soul
training and generated-keyframe approval are not claimed complete.

## Crop and review continuation — 25 September 2026

User requested implementation of native crop/review after importing the reference
archive. Same job/checkpoint/branch. Reused VideoCropOverlay and useCropBoxEditor;
manual selection with pixel controls, side-by-side original and rendered crop,
native-resolution PNG (no generative restoration). Private upload includes a
strict parent ID/revision/ETag and in-bounds pixel rectangle. Server verifies
parent state before and after upload, PNG output dimensions and storage limit.
Lineage is declared browser processing metadata, not a cryptographic proof that
client-supplied bytes were obtained by that transformation. Originals and their
approvals are unchanged; derived assets always start draft with subject/view
cleared for re-review. Crop approval remains bound to stored derivative bytes.

Full suite exposed a prior prompt.maxLength access regression in TalkingShot:
its schema has scene/dialogue rather than prompt. Explicit own-property fallback
restores execution. Moved provider response validation inside the reference
submission lease so malformed 2xx retains the ambiguous-submission lock.
52 backend tests pass, including crop lineage, stale parent, bounds, size,
approval preservation and TalkingShot regression paths. Live release pending.
Delivery Room update remains pending under the previously recorded access gap.

Live crop acceptance: Worker beaf1bb8-05c4-4ec5-b4cb-8788cd9a7ae2,
Pages https://82cdc992.mhoo-comfy.pages.dev. Fresh page required to load new UI.
Opened Crop on confirmed original, adjusted numeric bounds and inspected
side-by-side preview. Saved a 100x190 PNG privately; library count increased
17→18, new crop is draft, subject/view reset for review, original remains approved.
No provider request or generation. The low-resolution warning is displayed.
13 UI/crop-controller tests pass. Client-declared lineage limitation accepted
and documented; no claim of server-recomputed or verified source pixels.

## Automatic face selection and grouped references — 25 September 2026

Same job and checkout, branch codex/higgsfield-pages. User requested automatic
face boxes and grouping derivatives under originals. Added lazy browser-only
MediaPipe BlazeFace detection (pinned Tasks Vision 0.10.32, self-hosted runtime
and model). User selects a numbered face; native-resolution portrait suggestion
clips to image edges and limits padding near neighboring faces. No recognition,
provider transmission, restoration or automatic approval. Manual fallback remains
for missed faces/model load failures. Live sofa image produced three boxes;
confirmed center-right face selection produced a valid draft-ready crop.

Library follows parent lineage (including nested crops), newest derivative is
current, older versions are collapsed history, original metadata/approvals remain
untouched. Existing 23 assets group automatically without migration. Filter shows
groups with approved current crops; this is not a Soul training dataset exporter.
Eight focused tests cover selection, review constraints, grouping and crop bounds.
First deployed verification: https://68422662.mhoo-comfy.pages.dev. Final refinement
and release verification pending. Room metadata remains stale under previously
recorded update failure; pending reconciliation, no duplicate job/issue created.
