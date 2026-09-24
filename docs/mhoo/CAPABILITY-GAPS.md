# Higgsfield API versus the ComfyUI frontend

Verified 24 September 2026. This is a usable first adapter release, not a replacement for a Python ComfyUI execution server.

## Live result

Open **https://mhoo.dev/00/comfy/** with the existing owner login. The frontend is hosted by Cloudflare Pages (`mhoo-comfy`). The authenticated `mhoo-comfy` Worker serves its assets and translates API calls. Workflow/settings storage uses KV; job state, WebSocket events and polling use a Durable Object. The existing Higgsfield secret stays inside Cloudflare Secrets Store.

A real SOUL V2 image request completed, yielding one image in persisted job history. App job `31f69f4d-4a30-4438-b5a1-50b3ebd9236a`; provider request `f79b204c-c574-467c-8c46-4ad4d647831d`. The authenticated preflight estimate was **USD 0.004 / 0.050 credits**; this is an estimate, not a retrieved billing receipt. End-to-end completion took approximately 206 seconds. Only this one live image was submitted during acceptance. Video generation has not been exercised against the paid provider.

## Capability matrix

| Capability                                                          | Higgsfield API                                                                | This deployment / ComfyUI gap                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text to image                                                       | SOUL V2 and other model endpoints                                             | SOUL V2 node is integrated and live-tested. Aspect ratio, resolution, prompt enhancement, style, seed, and batch size are exposed. Other image models need catalog entries and validation.                                                          |
| Text to video                                                       | Seedance 2.5 and other families                                               | Seedance 2.5 node implemented; duration, aspect ratio, resolution, bitrate, format and audio options exposed. Not paid-generation-tested.                                                                                                           |
| Image to video                                                      | Seedance 2.5 image-to-video                                                   | Animate Image node implemented. Paste a public HTTPS image URL or connect the SOUL node's image URL output. Graph chaining is runtime-tested with a simulated provider, not a paid video run.                                                       |
| Other model families                                                | Current console lists Kling, Wan, Hailuo, LTX, Grok, Recraft, Qwen and others | Not integrated. The three-node catalog is deliberately explicit; the supplementary OpenAPI file is not the complete API catalog.                                                                                                                    |
| Editing, references, characters, motion transfer                    | Model-specific workflows and fields                                           | Not exposed yet. SOUL custom character reference and Seedance ending-image fields are also omitted from this initial curated schema. These are adapter gaps, not claims that Higgsfield lacks them.                                                 |
| File uploads                                                        | Presigned upload API for image/video/audio                                    | Upload button/local-file node is not wired. Public HTTPS input URLs work. Uploading and permanent output storage are next useful additions.                                                                                                         |
| Canvas, links and saved workflows                                   | API does not provide an editor                                                | Native ComfyUI canvas, node search, save/open and JSON workflow files are retained. KV stores workflows/settings; save/reload verified in the live browser.                                                                                         |
| Workflow execution                                                  | Individual asynchronous model requests                                        | Adapter orders up to eight supported nodes and forwards the first media URL along a link. One active workflow per owner. Multi-output fan-out and parallel batch queue execution are not supported.                                                 |
| Job history                                                         | Request IDs, status and result URLs                                           | Durable history, native queue panel and job details implemented. Jobs continue without an open browser. Workflow import/export does not include permanent copies of generated media.                                                                |
| Live progress                                                       | Queued/in-progress/terminal states                                            | Translated to native WebSocket status events. No diffusion step percentage or intermediate frame preview: the upstream UI can show 0% while Higgsfield works.                                                                                       |
| Cancellation                                                        | Allowed only while queued                                                     | Native cancel requests are handled asynchronously. If processing has started, tracking continues and a notification explains why cancellation failed. Completed generation wins a late cancel race; remaining unstarted graph nodes can be stopped. |
| Cost estimates                                                      | Authenticated estimate endpoint                                               | Adapter provides `/api/higgsfield/estimate` for one node. Not yet shown in the standard Run button UI. Run submits billable provider requests.                                                                                                      |
| Local checkpoints, LoRAs, ControlNet, VAE, latent tensors, samplers | Not equivalent to hosted model endpoint parameters                            | Cannot execute those standard ComfyUI/Python nodes here. Requires an actual ComfyUI GPU backend or a provider endpoint with equivalent functionality.                                                                                               |
| Custom Python nodes, Manager, local filesystem, model downloads     | No general Python runtime through generation API                              | Unsupported. Installing a ComfyUI extension does not give Cloudflare a GPU/Python executor.                                                                                                                                                         |
| Comfy Cloud account, credits and marketplace UI                     | Separate from Higgsfield                                                      | Some upstream UI controls remain visible but do not represent Higgsfield account functions. Use the existing workspace login; the Comfy Login button is unrelated.                                                                                  |
| Output retention                                                    | At least seven days, per current docs                                         | The adapter stores result URLs, not media bytes. Download important outputs; permanent R2 archival is not implemented.                                                                                                                              |
| Multi-user collaboration                                            | Provider credentials have account/organization scope                          | This deployment is owner-only. There is no shared canvas or per-user budget allocation.                                                                                                                                                             |

## Runtime boundaries

- Provider creation requests are never automatically retried. If a submission outcome is unknown, inspect Higgsfield history before rerunning.
- Status failures retry with a bounded count; polling stops after one hour. Stopping local tracking does not prove the provider stopped.
- Input schemas are pinned snapshots of the official model docs; new provider capabilities require an intentional update.
- Workflows/settings use eventually consistent KV. This is a single-owner first release, not a concurrent document editor.
- The Pages origin contains public static frontend assets; generation, stored workflows, results and secret access are on the authenticated Worker route.
- The governed hot-refresh preview has not been configured for this repository. The live URL is a production deployment.

## Next iterations

1. Native media upload and durable R2 output archival.
2. Paid end-to-end video and image-to-video acceptance, plus more model nodes chosen from actual usage.
3. Show a provider cost estimate and provider-aware status near Run; hide or relabel irrelevant upstream controls.
4. Add parallel/batched workflow handling only when needed; keep idempotency and credit boundaries explicit.

## Sources

- [Higgsfield model console](https://console.higgsfield.ai/)
- [SOUL V2 schema](https://docs.higgsfield.ai/docs/models/soul-2/generate.md)
- [Seedance 2.5 text-to-video schema](https://docs.higgsfield.ai/docs/models/seedance-2-5/text-to-video.md)
- [Seedance 2.5 image-to-video schema](https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md)
- [Uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md)
- [Billing, estimates and retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md)
- [Cancellation](https://docs.higgsfield.ai/docs/api-reference/requests/cancel-a-queued-request.md)
- [Model discovery/source priority](https://docs.higgsfield.ai/docs/llms.txt)
