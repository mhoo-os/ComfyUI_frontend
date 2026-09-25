# Canvas renderer

Private Node 24 + FFmpeg service for the authenticated Comfy Worker. Do not expose
its port directly to the Internet. The Worker supplies local media bytes; this
service never fetches URLs. Container configuration should disable outbound
Internet access and provide at least 2 GB RAM (multipart parsing buffers uploads).
Only one job runs per container; callers receive 503 while it is busy.

Build with `docker build --platform linux/amd64 -t comfy-renderer cloudflare/renderer`.
Run with `docker run --rm -p 8080:8080 comfy-renderer`. `GET /health` returns `ok`.

`POST /render` accepts multipart form data:

- `manifest`: JSON `{clips:[{file:"clip0",start:0,duration:4}],width:1280,height:720,transition:"cut",caption:"",musicVolume:0.2,originalVolume:1}`.
- `clip0` through `clip7`: uploaded video files, in manifest order.
- Optional `music`: an audio file, looped to the edit length.
- Optional `logo`: image overlaid at the top right, 15% of frame width.

Trims use seconds. Dimensions must be even, 128–1920. Each clip must be at least
0.5 seconds; total requested duration is capped at 120 seconds. `fade` overlaps
adjacent clips by 0.3 seconds, shortening the final edit. Clips are letterboxed
and normalized to 30 fps. Captions are static whole-video bottom text; manually
insert newlines for wrapping. Caption text is never interpreted as FFmpeg code.
Output is H.264/AAC MP4 with Content-Length, streamed after encoding finishes.
Missing clip audio becomes silence. Original sound and music volumes are 0–2.
There is no automatic loudness mastering; very high combined levels may clip.

Uploads are capped at 500 MiB, jobs at eight minutes, encoder/filter threads at
two. Temporary files are removed after success, failure or client disconnect.
Errors return JSON: 400 invalid requests, 422 invalid media/render errors,
504 timeout; busy requests return 503. Jobs are synchronous; the caller owns
persistence, retries, authorization and R2 archival. Failed renders never invoke
AI generation.

Run `node --test cloudflare/renderer/smoke.test.ts` with FFmpeg/FFprobe on PATH.
FFmpeg must include libx264, drawtext, xfade, and acrossfade. On macOS set
`RENDER_FONT=/System/Library/Fonts/Supplemental/Arial.ttf`; the container's default
is Debian DejaVu Sans. Typecheck using
`pnpm exec tsc -p cloudflare/renderer/tsconfig.json`.
