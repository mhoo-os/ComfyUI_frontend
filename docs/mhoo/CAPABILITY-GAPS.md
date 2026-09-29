# Higgsfield API versus the ComfyUI frontend

Updated 30 September 2026. Branch additions described below are not a production deployment receipt. Owner app: https://mhoo.dev/00/comfy/.

Cloudflare Pages serves the native canvas. The Access-protected Worker translates supported nodes to Higgsfield requests; a Durable Object coordinates execution, KV stores workflows/settings, and private R2 stores new generated outputs. Credentials remain in Cloudflare Secrets Store.

## Capability matrix

| Capability                                                          | Implemented here                                                                                                                                          | Remaining gap                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text to image                                                       | SOUL V2, plus Marketing Studio direct generation                                                                                                          | Other image model families need intentional schema/catalog additions.                                                                                                                                                                   |
| Reference image editing                                             | Marketing Studio: two legacy reference sockets plus a newline list, up to 16 images total; approved private tokens supported                              | Preset enhancement/catalog controls are not exposed. Additional references are entered as URLs/tokens; no multi-file picker.                                                                                                            |
| Text to video                                                       | Seedance 2.5 with duration, resolution, framing, audio, bitrate and format                                                                                | Paid talking-shot generation, exact transcript, R2 playback and reload persistence passed. Precise lip-sync quality still needs human review.                                                                                           |
| Image to video                                                      | Seedance 2.5 with starting and optional ending image; both accept graph links                                                                             | Paid first/last-frame acceptance remains pending.                                                                                                                                                                                       |
| Stronger video targets                                              | Kling 3.0 Standard/Pro multi-shot and existing element IDs, Kling O3 first/last-frame and image-reference, Cinema Studio 4.0, Seedance reference-to-video | Branch implementation; live provider acceptance pending. Element ownership is checked by Higgsfield. No automatic account-element creation.                                                                                             |
| Motion transfer                                                     | Kling 3.0 Motion Control (std/pro) and Genjutsu Motion Transfer from a URL, MP4 upload or linked video                                                    | The provider, not the adapter, checks clip length (3–30 s Kling, at least 4 s Genjutsu). Library tokens are images only, so `video_url` has no library path. No paid acceptance run yet.                                                |
| File upload                                                         | Native node buttons; JPEG, PNG, WebP or GIF up to 20 MB, MP4 up to 100 MB, or WAV up to 20 MB; presigned upload in Worker                                 | WAV only for provider audio upload; standalone speech/music synthesis is not exposed. Uploaded inputs remain subject to provider retention.                                                                                             |
| Output retention                                                    | New generated images/videos copied to private R2; authenticated playback supports byte ranges                                                             | Existing historical outputs are not backfilled. Archive requires a known size up to 250 MB; failures preserve provider URLs and stop after bounded retries. R2 storage is persistent until deliberately deleted, not a separate backup. |
| Canvas and workflows                                                | Native nodes, links, saved/opened workflows, settings, JSON import/export                                                                                 | Imported Python/GPU workflows are rejected before any paid submission.                                                                                                                                                                  |
| Execution                                                           | Up to 32 nodes; independent paid branches run concurrently under the existing scheduler; first output flows through links                                 | Per-output selection from batches is not exposed. Provider account concurrency still applies.                                                                                                                                           |
| History                                                             | Durable jobs, native gallery, request IDs retained per node, private archived media                                                                       | Workflow JSON exports refer to media; they do not bundle media bytes.                                                                                                                                                                   |
| Progress                                                            | Provider state and current workflow step shown near Run; jobs continue after closing the browser                                                          | Higgsfield does not provide diffusion-step percentages or intermediate frames.                                                                                                                                                          |
| Cost                                                                | Per-node estimate button; readable quoted prices or provider pricing explanation                                                                          | Full connected-workflow budget reservation and a whole-workflow price beside Run are not implemented. A linked node needs a concrete URL for its estimate. Estimates are not billing receipts.                                          |
| Cancellation                                                        | Durable cancellation intent; queued provider requests can cancel; completed outputs remain                                                                | Already processing requests may be uncancellable. No automatic resubmission after ambiguous paid POSTs.                                                                                                                                 |
| Account/model controls                                              | Unrelated Comfy Login and local Model Library hidden in the Higgsfield build; Manager remains disabled                                                    | Some upstream settings, templates and Apps UI still assume a full ComfyUI backend.                                                                                                                                                      |
| Local checkpoints, LoRAs, ControlNet, VAE, samplers, latent tensors | No equivalent general execution support                                                                                                                   | Requires a real ComfyUI GPU/Python backend or a particular provider model exposing an equivalent feature. An adapter alone cannot supply this.                                                                                          |
| Python custom nodes and filesystem/model downloads                  | Unsupported                                                                                                                                               | Cloudflare Pages/Workers is not a ComfyUI Python/GPU execution host.                                                                                                                                                                    |
| Multi-user collaboration                                            | Owner-only Access/JWT authorization                                                                                                                       | No shared canvas or per-user credit allocation.                                                                                                                                                                                         |

## September 29 continuation: verified gaps and remaining limits

PR #15 remains the delivery record for MHO-312. This section describes branch
behavior; neither passing tests nor a provider schema proves live account access.

| Capability                                                     | Branch behavior                                                                                                                                                                                                                            | Evidence / remaining acceptance                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-shot Kling                                               | Standard and Pro accept `multi_shots` and optional `multi_prompt`; 1–6 custom shots, each 1–15 seconds and at most 512 prompt characters. Custom timings reach both estimates and submissions; the conflicting scalar duration is omitted. | Official [Pro usage notes](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md) and [Standard schema](https://dash.higgsfield.ai/models/kling-video/v3.0/std/image-to-video/llms.txt). No paid multi-shot acceptance yet.                                                                                      |
| Character elements                                             | Existing decimal-string element IDs, preserved without numeric rounding.                                                                                                                                                                   | IDs must already belong to the requesting API account; the engine does not create or prove ownership of elements.                                                                                                                                                                                                               |
| More references                                                | Cinema Studio and Seedance reference nodes accept up to 30 images, 10 videos and 10 audio references. Legacy sockets count toward each limit.                                                                                              | [Cinema Studio](https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md), [Seedance](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md). Provider handles video/audio duration normalization.                                                                                                |
| Audio conditioning                                             | Public HTTPS audio references, including audio-only conditioning for Seedance.                                                                                                                                                             | This guides generated video; it is not standalone voice or music synthesis. WAV upload is implemented below; other audio formats are not exposed.                                                                                                                                                                               |
| Finishing                                                      | Every supported generated-video model can feed Clip → Sequence → Compose → Export after private archival.                                                                                                                                  | Worker integration verifies one Kling generation, R2 archive and export with mocked external services. Exported private media still cannot feed back into provider reference inputs.                                                                                                                                            |
| Standalone speech, voices, music/SFX, Topaz                    | Not implemented.                                                                                                                                                                                                                           | The recorded September 29 MCP catalog exposed speech models and listed music/SFX as game-pipeline-only. The public API catalog inspected on September 29 did not establish corresponding endpoints. Absence from that catalog is not proof of provider unavailability. Live MCP discovery is unavailable in this Codex session. |
| Model recommendation, character-sheet and multi-shot workflows | No MCP-equivalent orchestration added.                                                                                                                                                                                                     | Our existing film compiler and reference library are separate tools; endpoint controls alone do not establish workflow parity.                                                                                                                                                                                                  |

Use the existing image/video sockets for uploads or connected generated media.
For additional references, put one HTTPS URL per line in `image_urls`,
`video_urls` or `audio_urls`. Only image lists accept approved `mhoo-asset:`
tokens; review/revocation checks remain server-side, and estimates do not upload
private reference bytes. List order is legacy sockets first, then list entries.
A blank list is omitted. Per-list text bounds are local limits as well as the
provider's item limits.

For custom Kling shots, enable `multi_shots` and set `multi_prompt` to a JSON
array such as:

```json
[
  { "prompt": "Wide shot of the doorway.", "duration": 4 },
  { "prompt": "Cut to the visitor.", "duration": 3 }
]
```

Higgsfield sums these timings to seven seconds. The top-level duration is
omitted for custom shots, so a longer sequence never sends an invalid scalar. Leave the array empty for automatic cuts using the
normal duration. Multi-shot and array validation runs during graph planning,
before any upstream paid node executes. Nested shot prompts are redacted from
provider diagnostics. Generated audio stays off unless explicitly enabled.

The existing unit Actions workflow's frontend Vitest include pattern omits the
Higgsfield engine suite. Engine typecheck and Worker tests are verified locally;
adding them to Actions is pending because the current GitHub connection cannot
update workflow files.

## September 30 continuation: API input and discovery gaps

The current public catalog was inspected through its console link (which redirects
to [Explore](https://open.higgsfield.ai/explore)). Our engine implements selected
models, not every model in that catalog. Live Higgsfield MCP discovery is unavailable
in this session; the MCP comparison above remains based on the September 29 record.

- **Kling O3 image-reference:** added the missing MHO-312 target at
  `kling-video/o3/image-reference`. Optional first/last frames remain distinct from
  reference images. The reference socket and newline list share a local limit of
  16 images; this is an engine bound, not a documented provider maximum.
  Standard/Pro/4K, aspect ratio, account-owned element IDs and sound are exposed.
  [Provider usage notes](https://docs.higgsfield.ai/docs/models/kling-o3/image-reference.md)
  require a nonempty top-level prompt (at most 2,500 characters), and 1–6 explicit
  shots whenever `multi_shots` is enabled, including `shot_type=intelligent`.
  Zero-second shots are rejected despite the looser published JSON schema.
  Estimates and generation omit scalar duration when custom timings are present.
- **Audio input:** the existing upload route now accepts documented `audio/wav`
  and `audio/x-wav`, streamed at an exact declared length, up to a local 20 MB bound.
  The native upload button appends one URL to `audio_urls` on Cinema Studio and
  Seedance reference nodes. Existing URLs remain in order. This is audio
  conditioning for video, not a speech/voice/music generator or exact lipsync.
  [Upload contract](https://docs.higgsfield.ai/docs/concepts/file-uploads.md).
  Credentials and owner cookies are not forwarded to presigned storage.
- **Agent discovery:** `/api/higgsfield/capabilities` now includes each model's
  output kind, engine input schema, source, upload limits and the scheduler's
  actual four-workflow limit. `getProductionCapabilities` exposes this read-only
  through native WebMCP. These are engine widget schemas (newline lists and JSON
  shot text), not raw provider JSON Schema. They do not prove account access or
  creative quality, and do not automatically recommend or execute a model.

Local verification: 317 engine tests and 17 native-control/browser-tool tests pass.
Engine and full frontend typechecks, repository lint (existing warnings), Knip,
formatting and ADR validation pass. Tests use mocked upstream services; no paid
render or deployment was performed. Current-head Actions results belong on PR #15.

Still open: standalone speech/voices/music/SFX and Topaz need a verified API
contract and account/provider decision; character-sheet and model-recommendation
orchestration, a multi-file reference picker, whole-workflow budget reservation,
and remaining public model families are not implemented. MHO-312 explicitly
requires separate owner approval for an audio provider, merge, deployment and
paid acceptance renders. No new provider has been selected or configured.

## Creator-reference showcase

The saved **Coffee campaign — Nathan Dumlao reference** workflow demonstrates:

1. Upload a licensed creator photograph and restage the foreground cup as a campaign keyframe.
2. Feed that generated image into a second reference-edit node to create a matching closer end frame.
3. Connect both generated frames into Seedance for a four-second camera move with steam and ambience.

Source: [Nathan Dumlao’s coffee photograph](https://unsplash.com/photos/zUNs99PGDg0), [Unsplash license](https://unsplash.com/license). This is a derivative technical showcase, not the photographer’s work or endorsement.

The portable [workflow JSON](workflows/coffee-campaign.json) uses the public reference URL. The live saved copy uses the uploaded reference URL. Its explicit economical settings are medium/1k/16:9 for images and four seconds/720p for video; the general Marketing Studio node defaults match the provider’s high/2k/auto defaults.

Live native upload and estimate checks passed. The uploaded-reference first image estimate was **USD 0.042**, including the account’s displayed discount. Video estimation returned a token-pricing explanation, not a fixed quote: approximately **USD 1.85** for four seconds at 1280×720 before discounts. This coffee reference-to-video workflow remains unexecuted. A separate authorized talking-shot video completed on 25 September; see the acceptance record below.

## Evidence

- 19 adapter tests pass, including real Miniflare Durable Object/R2 storage, range playback, upload header isolation, reference-edit→video chaining and transient/permanent archival failure handling without duplicate paid submissions.
- Full frontend build/typecheck, Worker typecheck, repository lint (199 existing warnings), formatting and Knip passed.
- Live browser verified native upload into the correct node input, real estimate button, linked first/last-frame canvas, hidden unrelated Login/Model Library, and provider-aware idle status. These original checks preceded the paid talking-shot acceptance recorded below.
- Prior live SOUL image: app job `31f69f4d-4a30-4438-b5a1-50b3ebd9236a`, provider `f79b204c-c574-467c-8c46-4ad4d647831d`; one completed image in approximately 206 seconds. That older output is not archived in R2.

## Sources and operating boundaries

- [Model catalog](https://open.higgsfield.ai/explore)
- [Marketing Studio schema](https://dash.higgsfield.ai/models/marketing-studio/image/llms.txt)
- [SOUL V2](https://docs.higgsfield.ai/docs/models/soul-2/generate.md)
- [Seedance text to video](https://docs.higgsfield.ai/docs/models/seedance-2-5/text-to-video.md)
- [Seedance image to video](https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md)
- [Uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md)
- [Billing and retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md)

Provider submissions are never automatically retried. Polling/archive errors have a bounded retry count and a one-hour overall timeout. An ambiguous submission or stopped local tracking does not prove the provider stopped or did not bill. Saved workflows/settings use eventually consistent KV. A remote hot-refresh preview is not configured; the linked app is production.

See [PIPELINE-VALIDATION.md](PIPELINE-VALIDATION.md) for the schema-checked corrections to SOUL Cinema, camera controls, dialogue and timeline assembly.

## Canvas finishing update

Clip, Sequence, Compose and Export now execute on Cloudflare Containers with FFmpeg and private R2 outputs. The native canvas and saved history cover basic cuts/fades, trim/order, static caption/logo, audio mixing and MP4 export. Live finished-video acceptance passed using a built-in generated image with deterministic motion (no Higgsfield generation charges). See [PRODUCTION-FINISHING.md](PRODUCTION-FINISHING.md) for limits, exact remaining gaps and deployment evidence.

## Talking shot and agent planning — 25 September 2026

The new Script → Talking Shot node compiles separate scene/dialogue into a
verified Seedance 2.5 text-to-video request. Choose template or Jev/Astra; preview
the request before Run. AI preview uses planner tokens but no Higgsfield credits.
The live gateway planner passed (Jev 1.352s, Astra 5.808s on one sample). New
talking-shot jobs use Workflows with the existing DO submission ledger and native
history. Local real-Workflows tests use simulated provider media; they do not
prove production speech quality. The authorized paid acceptance below verifies one exact spoken transcript and
playable output. Lip-sync precision and identity across separate shots remain
best-effort; one successful sample is not a reliability guarantee.

Preview then Run in AI mode drafts twice; approved-plan reuse is not implemented.
Jev's 0.7 confidence cutoff is provisional, not calibrated. Character locking,
audio-track-driven lipsync and one-click paid WebMCP approval remain gaps.

## Paid single-shot acceptance — 25 September 2026

User approved one Higgsfield render capped at USD 3 after an approximate USD 2.31
estimate (pricing formula, not a billing receipt). Submitted once using native
Run with planner `jev_astra`, five seconds, 720p, 16:9. No rerender was submitted.

- App job: `6fb05b32-177c-4f81-bc80-46487646541c`; provider request:
  `a834faf2-480f-4b07-a331-52a5962d3f97`.
- Cloudflare Workflow executed Jev routing (single_speaker, 0.99, 1093 ms),
  Astra scene expansion (5666 ms), submission, durable polling and R2 archival.
  Native job completion time: 416.45 seconds.
- Output: 5.041667 seconds, 1280×720, 24 fps, H.264 video with AAC 32 kHz audio;
  3,471,622 bytes. SHA-256:
  `92b85dc1842af1f3f6d4ac45ca03107e7ba571ddd4b0e816d9b2454c59df757a`.
- Local Whisper small transcription: “Your next big idea starts here.” Exact
  requested words, with no additional transcribed dialogue. This is automatic
  transcription evidence, not a human listening assessment.
- Native gallery playback verified with advancing currentTime and paused=false.
  Authenticated R2 range request returned 206, bytes 0–1023/3471622.
  The job survived browser reload while rendering; completed history also
  persisted after reload.
- Sampled frames show the same visible trader and chip, a steady composition and
  mouth motion. Frame-accurate audio/lip alignment is not measured; human playback
  review remains required before treating this as final creative approval.

Open the saved [Script to Talking Shot workflow](https://mhoo.dev/00/comfy/#58405a58-644f-43a9-83ad-1bdfbef17d3b)
and its latest completed job to play the private result. Actual billed amount
was not exposed by this job response; the estimate is not a receipt.

Multi-shot cuts/fades and supplied background-music mixing already exist in the
finishing nodes. Automatic music selection/generation, consistent character and
voice references, speaker assignment and multi-character dialogue need separate
acceptance. This single-shot run does not validate those capabilities.

### Private source reference review

Image-input nodes now offer a character-reference library: private R2 ingestion,
era/subject metadata, atomic batch approval and revision-bound canvas tokens.
Only approved references transfer server-side to Higgsfield when their node runs.
Estimates do not transfer photos. Revoking approval prevents future use and does
not remove copies already sent to a provider. Active submissions briefly lock
review/metadata changes, up to five minutes following an ambiguous failure.

Soul ID V2 training is now available in the reference library through the
documented API. One live two-reference training completed on 25 September 2026.
The provider accepts 1–100 photos; 5–20 remains a dataset-planning suggestion,
not an API minimum. Cropping, optional subject masks and local quality screening
are available. Quality screening does not identify a person or approve likeness.
Generated-keyframe approval and cross-shot identity evaluation remain separate
production gates. The initial training UI permits one saved attempt and does not
automatically retry uncertain submissions. Existing direct Higgsfield upload buttons
remain a separate explicitly initiated transfer path, not private-library ingest.

## Video inputs and motion targets — 29 September 2026

Higgsfield nodes accept a `video_url` input: a public HTTPS URL, an MP4 uploaded
through the node's upload button (streamed, up to 100 MB), or the output of a
generated video node. New nodes: Kling 3.0 Motion Control, Genjutsu Motion
Transfer, Kling 3.0 Pro, Kling O3 first/last frame, Cinema Studio 4.0 and
Seedance 2.5 reference-to-video. Each exposes only documented parameters and is
covered by request-shape, validation and estimate tests against a mocked
provider. No paid generation has been run on these nodes.

The continuation above adds audio references for Cinema Studio and Seedance,
larger reference lists, Kling multi-shot controls and finishing support for all
supported generated-video models. Standalone speech/voice endpoints remain
unverified; audio conditioning does not establish speech-generation parity.
