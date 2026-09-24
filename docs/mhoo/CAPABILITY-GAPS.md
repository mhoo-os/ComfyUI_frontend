# Higgsfield API versus the ComfyUI frontend

Updated 25 September 2026. Owner app: https://mhoo.dev/00/comfy/.

Cloudflare Pages serves the native canvas. The Access-protected Worker translates supported nodes to Higgsfield requests; a Durable Object coordinates execution, KV stores workflows/settings, and private R2 stores new generated outputs. Credentials remain in Cloudflare Secrets Store.

## Capability matrix

| Capability                                                          | Implemented here                                                                                         | Remaining gap                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text to image                                                       | SOUL V2, plus Marketing Studio direct generation                                                         | Other image model families need intentional schema/catalog additions.                                                                                                                                                                   |
| Reference image editing                                             | Marketing Studio reference node; URL or native local upload; connected generated images                  | One reference per node; provider supports up to 16. Preset enhancement/catalog and multiple-reference controls are not exposed.                                                                                                         |
| Text to video                                                       | Seedance 2.5 with duration, resolution, framing, audio, bitrate and format                               | Paid talking-shot generation, exact transcript, R2 playback and reload persistence passed. Precise lip-sync quality still needs human review.                                                                                           |
| Image to video                                                      | Seedance 2.5 with starting and optional ending image; both accept graph links                            | Paid first/last-frame acceptance remains pending.                                                                                                                                                                                       |
| File upload                                                         | Native node buttons; JPEG, PNG, WebP or GIF up to 20 MB; provider presigned upload performed server-side | Video/audio uploads are not exposed. Uploaded inputs remain subject to provider retention.                                                                                                                                              |
| Output retention                                                    | New generated images/videos copied to private R2; authenticated playback supports byte ranges            | Existing historical outputs are not backfilled. Archive requires a known size up to 250 MB; failures preserve provider URLs and stop after bounded retries. R2 storage is persistent until deliberately deleted, not a separate backup. |
| Canvas and workflows                                                | Native nodes, links, saved/opened workflows, settings, JSON import/export                                | Imported Python/GPU workflows are rejected before any paid submission.                                                                                                                                                                  |
| Execution                                                           | Up to eight nodes, sequential topological execution; first media output flows through connected URLs     | One active workflow per owner. No parallel execution or individual selection among a batch's media outputs.                                                                                                                             |
| History                                                             | Durable jobs, native gallery, request IDs retained per node, private archived media                      | Workflow JSON exports refer to media; they do not bundle media bytes.                                                                                                                                                                   |
| Progress                                                            | Provider state and current workflow step shown near Run; jobs continue after closing the browser         | Higgsfield does not provide diffusion-step percentages or intermediate frames.                                                                                                                                                          |
| Cost                                                                | Per-node estimate button; readable quoted prices or provider pricing explanation                         | Full connected-workflow budget reservation and a whole-workflow price beside Run are not implemented. A linked node needs a concrete URL for its estimate. Estimates are not billing receipts.                                          |
| Cancellation                                                        | Durable cancellation intent; queued provider requests can cancel; completed outputs remain               | Already processing requests may be uncancellable. No automatic resubmission after ambiguous paid POSTs.                                                                                                                                 |
| Account/model controls                                              | Unrelated Comfy Login and local Model Library hidden in the Higgsfield build; Manager remains disabled   | Some upstream settings, templates and Apps UI still assume a full ComfyUI backend.                                                                                                                                                      |
| Local checkpoints, LoRAs, ControlNet, VAE, samplers, latent tensors | No equivalent general execution support                                                                  | Requires a real ComfyUI GPU/Python backend or a particular provider model exposing an equivalent feature. An adapter alone cannot supply this.                                                                                          |
| Python custom nodes and filesystem/model downloads                  | Unsupported                                                                                              | Cloudflare Pages/Workers is not a ComfyUI Python/GPU execution host.                                                                                                                                                                    |
| Multi-user collaboration                                            | Owner-only Access/JWT authorization                                                                      | No shared canvas or per-user credit allocation.                                                                                                                                                                                         |

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
