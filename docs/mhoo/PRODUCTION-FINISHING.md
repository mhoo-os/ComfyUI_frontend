# Production finishing on the canvas

The app hosts a native Clip → Sequence → Compose → Export workflow. Cloudflare Pages hosts the UI; the existing Worker and Durable Object coordinate execution; a private Cloudflare Container runs FFmpeg and returns an MP4 to private R2. No second hosting provider or browser-exposed credentials are required.

## Use

Import `docs/mhoo/workflows/production-finishing.json`, upload videos with each Clip node's upload button, set start/duration, connect clips to Sequence in playback order, choose cut or fade, and set a caption and optional uploaded logo/music in Compose. Export chooses 720p/1080p and landscape/portrait/square. Run produces a playable/downloadable MP4 in the normal job history. A completed Higgsfield video can connect directly to a Clip's video URL input after converting the widget to an input.

Uploads are stored privately and represented by `mhoo-media:` references. Clip/Compose upload buttons support video, audio and logo files respectively. No arbitrary remote URL is fetched by FFmpeg. Generated video outputs must finish R2 archival before rendering. Finishing-only workflows do not use Higgsfield credits. Running connected generation nodes again still incurs generation charges; for edit iterations reuse uploaded clips or completed output media references.

## Initial limits

- Eight clips, each 0.5–30 seconds; combined duration at most 120 seconds.
- Up to 80 MiB per upload, 480 MiB combined renderer inputs, 250 MiB final export.
- One active owner workflow and one renderer instance; 8-minute renderer timeout.
- H.264/AAC MP4 at 30 fps. Mixed source dimensions are fitted with letterboxing.
- Cut or 0.3-second crossfade; fades shorten the overall sequence by 0.3 seconds per join.
- One whole-video bottom caption, optional top-right logo, looped background music and original-audio volume controls. This is not timed speech transcription or multi-track caption editing.
- Cancellation requested during render is applied when the render returns; it does not yet immediately kill FFmpeg. Completed outputs remain available.

The renderer uses a standard-2 container (1 vCPU, 6 GiB RAM), no outbound internet and one-minute idle shutdown. Filesystem contents are temporary; only R2 outputs persist. Active HTTP requests keep the container alive. The browser only reaches the owner-authenticated Worker; there is no direct public renderer route.

## Verification and remaining gaps

Real FFmpeg tests run in the target Linux amd64 Debian container, covering cuts/fades, trims, missing audio, literal caption characters, logo/music overlays and invalid clip ranges. Adapter tests exercise uploads, graph serialization, job completion and R2 range playback. See DELIVERY-CHECKPOINT.md for live deployment and acceptance IDs.

The built-in ChatGPT image generator is a conversation tool, not a callable API node inside this deployed app. For the showcase it creates the still here; a deterministic local pan/zoom turns it into an input clip, and the actual canvas performs trimming, sequencing, captioning and final Cloudflare rendering. This does not prove Higgsfield image-to-video or generative motion. No Higgsfield credits are authorized for this showcase after the user selected the built-in generator.

Next gaps: embedded timeline scrubbing/drag ordering, per-shot/timed captions, multiple audio tracks/ducking, clip-level retry/cache/resume, immediate render cancellation, and stronger final media QA. Native nodes already keep finishing inside the canvas, but a full miniature timeline editor remains future UI work.

Sources: [Cloudflare Containers](https://developers.cloudflare.com/containers/), [instance limits](https://developers.cloudflare.com/containers/platform/limits/), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html).
