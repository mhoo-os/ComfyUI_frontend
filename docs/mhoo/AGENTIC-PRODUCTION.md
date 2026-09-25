# Agent-controlled production: validated architecture

Updated 2026-09-25. First requested workflow: **Script-to-Talking Shot**.
This is the acceptance target, not a claim that the complete stack is deployed.

## Boundaries

Browser agent → WebMCP → authenticated Comfy adapter → durable execution →
verified provider endpoint → private R2 → native history and preview.
Jev suggests semantic routes; deterministic code owns capability, authorization,
budget and payload validation. Astra writes creative plans, not arbitrary HTTP
requests. FFmpeg finishing remains a Cloudflare Container.

Graphs containing HiggsfieldTalkingShot use Cloudflare Workflows for planning
and durable execution ticks. ComfyJobs retains the owner queue, submission ledger,
cancellation state and native history. Other graphs retain Durable Object alarms.
Each job persists its runner; alarms only launch Workflows for talking-shot jobs.

## Implemented browser tools

Feature-detected WebMCP exposes getCanvasState, updateNodeParameter,
queueCanvasWorkflow and getProductionJob. Current browser/spec use
`document.modelContext`; navigator is a compatibility fallback. Registration uses
`inputSchema`, not `parameters`. Unknown browsers retain the normal interface.
Updates require a fresh graph revision, validate primitive types/ranges/options,
preserve widget callbacks/change tracking and refuse connected inputs.
Paid generation is disabled through WebMCP until a user-held approval mechanism
is implemented. Native Run remains available after user review. Results come from the authenticated backend,
not arbitrary agent-injected URLs. Completion uses normal history/events, not a
WebMCP callback dependency. WebMCP itself provides neither an autonomous agent
nor a durable callback bus.

## Script-to-Talking Shot acceptance

Separate the **scene description** from the **exact spoken words**. The example
“a trader pitching a chip” supplies no dialogue or audio track. A five-second
shot also needs a realistic word count. Keep visual reference, dialogue, voice,
duration and output format explicit. Prefer one verified image-plus-audio
endpoint if available; do not automatically spend on motion generation before a
lip-sync stage that might require only a still.

1. Inspect/update the script and shot settings through native browser tools.
2. Jev classifies semantic intent; code selects only enabled, verified routes.
3. Astra returns a compact structured creative plan via Responses API.
4. The backend compiles an endpoint-specific request, preflights media and cost.
5. Persist submission intent; submit once; save provider request ID immediately.
6. Poll to terminal status or use authenticated, deduplicated provider webhooks.
7. Archive media by streaming into private R2; optionally finish in FFmpeg.
8. Show playable results in native canvas history, surviving page reload.
9. Verify spoken words, audible speech, lip alignment and character consistency
   manually. A successful HTTP response does not prove those quality criteria.

Implemented: a scene/dialogue canvas node, template or Jev/Astra planning, and
Workflows execution for this node. The existing default AI Gateway uses the
user-selected codex-lb and typesafe BYOK aliases. No provider key is exposed to
the Worker or browser; the Worker uses existing gateway authentication.
Live planner compatibility passed through the existing gateway: Jev 1.352s,
Astra 5.808s on one sample (not a latency guarantee). Paid single-shot execution subsequently passed in 416.45 seconds, including
R2 archival, native playback and exact dialogue transcription. Precise lip-sync
fidelity still needs human playback review; see CAPABILITY-GAPS.md. The selected Seedance text-to-video route generates
audio from prompt instructions; it is labeled experimental. Built-in ChatGPT image generation is available in this
conversation, not as an API credential inside the app. That image-generator selection did not authorize provider spending. The user
subsequently approved one Higgsfield render up to USD 3; that single test completed.

## Payload enforcement

Use a versioned capability catalog with one strict schema per endpoint, rather
than a shared model/duration/camera enum. Reject unknown fields and unsupported
combinations before submission. Do not silently strip a requested capability,
change a model or apply a cost-changing default. Return an actionable validation
error and offer explicit alternatives. Preserve the requested creative plan
separately from the compiled provider payload.

Structured Outputs constrain successful supported output, but refusals,
truncation, unsupported schemas, media errors and provider schema drift still
need handling. Zod runtime validation remains mandatory. It cannot guarantee
zero HTTP 400s. Unknown keys are not guaranteed to produce precisely HTTP 400
on every endpoint; clients must handle documented provider errors.

Prompt translation is permitted only as an explicitly best-effort creative
request. It cannot turn unsupported camera trajectories or exact lip sync into
guaranteed controls. Retry transient polling/storage failures with bounds;
do not retry schema errors using an invented fallback schema. An ambiguous paid
POST must be reconciled, not blindly retried. Workflow checkpoints are not an
exactly-once guarantee for external side effects.

## Corrections to the proposed model map

- SOUL Cinema is text-to-image. It is not a generic video camera controller or
  arbitrary-image cinematic refinement endpoint.
- Cinema Studio 4.0 documents explicit camera/lens/color controls. Do not copy
  those fields to SOUL, Kling or Wan without their exact endpoint schema.
- Verified Seedance 2.5 image-to-video uses image_url, optional end_image_url,
  and generate_audio. That does not establish an input_audio video-to-lip-sync
  contract or exact spoken-script fidelity.
- The proposed higgsfield-speech2video and higgsfield-wan-2.2 identifiers and
  three-stage chain remain unverified. Current video catalog lists newer Wan
  variants; do not invent a route from a product name.
- “3D Jutsu” was not verified. Genjutsu editing is not proof of 3D asset output.
- Jev is a text decision model, not a vision model, autonomous agent or
  deterministic permission engine. Measure p50/p95 latency and route quality;
  sub-100ms is not an app acceptance guarantee.
- gpt-6-astra supports image/text input and structured text output. Tool use
  requires Responses API. Its large context is optional; use a compact shot
  brief/story bible. Live gateway access to gpt-6-astra was verified on one planner-only request.

## Cloudflare costs and durability

Workflows sleeps/waits avoid active CPU billing; they are not universally free.
Current pricing bills steps (including sleep/wait) and retained state, subject
to allowances. Separate planning, paid submission, polling, archival and render
steps. Checkpoint IDs/R2 keys, never video buffers. A 30-second sleep does not
mean a render completed. Use this.env bindings and bounded terminal-state loops.
R2 has no egress charge but storage/operations still cost money. FFmpeg cannot
run as a native subprocess in an ordinary Workflow isolate; use the existing
Container. Keep authenticated playback unless publishing is expressly wanted.

## Sources

- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [TypeSafe models](https://docs.typesafe.ai/models.md)
- [TypeSafe API](https://docs.typesafe.ai/api.md)
- [Astra model](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Higgsfield video catalog](https://docs.higgsfield.ai/docs/models/video-generation.md)
- [Seedance schema](https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md)
- [SOUL Cinema](https://docs.higgsfield.ai/docs/models/soul-cinema/generate.md)
- [Cinema Studio schema](https://dash.higgsfield.ai/models/higgsfield/cinema-studio/4.0/llms.txt)
- [Workflows rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
