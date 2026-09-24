# Higgsfield API versus the ComfyUI frontend

Verified 24 September 2026. Owner app: https://mhoo.dev/00/comfy/.

Cloudflare Pages serves the native canvas. The Access-protected Worker translates supported nodes to Higgsfield requests; a Durable Object coordinates execution, KV stores workflows/settings, and private R2 stores new generated outputs. Credentials remain in Cloudflare Secrets Store.

## Capability matrix

| Capability                                                          | Implemented here                                                                                         | Remaining gap                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text to image                                                       | SOUL V2, plus Marketing Studio direct generation                                                         | Other image model families need intentional schema/catalog additions.                                                                                                                                                                   |
| Reference image editing                                             | Marketing Studio reference node; URL or native local upload; connected generated images                  | One reference per node; provider supports up to 16. Preset enhancement/catalog and multiple-reference controls are not exposed.                                                                                                         |
| Text to video                                                       | Seedance 2.5 with duration, resolution, framing, audio, bitrate and format                               | Real paid video acceptance remains pending.                                                                                                                                                                                             |
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

Live native upload and estimate checks passed. The uploaded-reference first image estimate was **USD 0.042**, including the account’s displayed discount. Video estimation returned a token-pricing explanation, not a fixed quote: approximately **USD 1.85** for four seconds at 1280×720 before discounts. Paid execution is pending a spending-limit reply; no paid requests have been made in this continuation.

## Evidence

- 19 adapter tests pass, including real Miniflare Durable Object/R2 storage, range playback, upload header isolation, reference-edit→video chaining and transient/permanent archival failure handling without duplicate paid submissions.
- Full frontend build/typecheck, Worker typecheck, repository lint (199 existing warnings), formatting and Knip passed.
- Live browser verified native upload into the correct node input, real estimate button, linked first/last-frame canvas, hidden unrelated Login/Model Library, and provider-aware idle status. Paid output quality and video playback are not yet verified.
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
prove production speech quality. Exact dialogue, lip-sync and identity remain
best-effort/unverified until an authorized paid video acceptance run.

Preview then Run in AI mode drafts twice; approved-plan reuse is not implemented.
Jev's 0.7 confidence cutoff is provisional, not calibrated. Character locking,
audio-track-driven lipsync and one-click paid WebMCP approval remain gaps.
