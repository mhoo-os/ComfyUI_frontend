# Validation of the proposed Higgsfield-only generation pipeline

Checked against official model schemas on 24 September 2026. Documentation establishes accepted fields, not this account's access or generated-output quality. Paid acceptance remains pending.

| Proposed stage                         | Verdict and correction                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SOUL 2 / Marketing Studio assets       | Supported. SOUL 2 accepts a completed account-owned `custom_reference_id` for character reference; a repeated prompt or seed is not a guarantee of identity consistency. Marketing Studio accepts `image_urls` for editing/product references. Our adapter exposes one reference image per Campaign node and a completed SOUL V2 reference UUID plus strength. Reference-library training has completed a live API test.                                         |
| Image URL → SOUL Cinema refinement     | Not supported by the documented schema. `higgsfield-ai/soul/cinema` is text-to-image with optional trained `custom_reference_id` and a fixed cinematic style. It has no arbitrary `image_url` input and no explicit camera/lens/color controls. Use it to generate the initial cinematic still, or use an image-edit endpoint to refine an existing image.                                                                                                       |
| Camera control / first and last frames | Model-specific. Seedance 2.5 image-to-video accepts `image_url` and optional `end_image_url`, both strings; no `input_images_end`, `motion_strength`, or structured camera preset fields. Camera intent can be prompted, but endpoints do not guarantee precise geometric trajectories. Cinema Studio 4.0 accepts `image_urls`, `camera_movement`, `camera_lens`, `camera_model`, `camera_aperture`, and `color_palette`. It outputs video, not a refined still. |
| Dialogue / avatars with Seedance       | Partially supported, overstated as written. `generate_audio` enables audio; reference-to-video accepts `audio_urls` with image/video references. These fields do not by themselves establish deterministic script reading, exact lip-sync, voice cloning, or a separate avatar/lip-sync endpoint. Validate speech accuracy and synchronization with actual samples before promising them. Our current adapter has not exposed audio-reference inputs.            |
| Orchestrator                           | Required for a reliable multi-stage workflow, and already implemented by our Cloudflare Worker/Durable Object. No additional Python/Node service is needed just to pass URLs. It validates the graph, persists request IDs, polls, routes outputs, cancels, archives, and avoids automatically retrying paid submissions.                                                                                                                                        |
| Timeline finishing                     | Required when the deliverable is a deliberately edited multi-clip film with cuts, captions, mixing and soundtrack placement; optional for a single generated clip. FFmpeg or a Remotion rendering service can supply this stage. A normal Pages static frontend or Worker is not a native FFmpeg/Chromium rendering host. Storage and delivery can remain on R2.                                                                                                 |

## Corrected composition

Reference/trained identity → image generation or reference edit → optional still refinement → Seedance image-to-video **or** Cinema Studio camera-directed video → optional validated dialogue processing → optional timeline renderer → R2 delivery.

Do not force every project through every stage. For the deployed coffee showcase, the useful path is reference edit → matching end-frame edit → first/last-frame Seedance video. The visual node canvas expresses dependencies; the Durable Object executes the HTTP workflow.

## Authoritative sources

- [SOUL 2](https://docs.higgsfield.ai/docs/models/soul-2/generate.md)
- [Marketing Studio](https://dash.higgsfield.ai/models/marketing-studio/image/llms.txt)
- [SOUL Cinema](https://docs.higgsfield.ai/docs/models/soul-cinema/generate.md)
- [Seedance image to video](https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md)
- [Seedance reference to video](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md)
- [Cinema Studio 4.0](https://dash.higgsfield.ai/models/higgsfield/cinema-studio/4.0/llms.txt)
