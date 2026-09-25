# Higgsfield API price reference

Verified **25 September 2026**, from the signed-in [image pricing](https://open.higgsfield.ai/pricing?tab=images) and [video pricing](https://open.higgsfield.ai/pricing?tab=videos) pages.

**29 families / 80 variants: 8 image families (14 variants), 21 video families (66 variants).** All primary pricing pages and expandable modes were captured. This is the full displayed catalog, not every quality/resolution/audio configuration. Machine-readable companion: [higgsfield-api-prices.json](higgsfield-api-prices.json).

All amounts are **USD**. “From” means an advertised starting rate; the highest listed resolution does not necessarily cost that rate. Regular prices are the crossed-out amounts. Blank resolution labels are retained as —; duration labels are copied literally and must not be used as API validation rules.

## Image prices

| Model / mode                                                                                                        | Resolution label | Advertised USD per image | Regular USD | Discount |
| ------------------------------------------------------------------------------------------------------------------- | ---------------- | -----------------------: | ----------: | -------: |
| [Marketing Studio Image — 2.5 Sunburst](https://open.higgsfield.ai/models/marketing-studio/image/sunburst)          | up to 4k         |             from $0.0095 |     $0.0126 |      25% |
| [Marketing Studio Image — 2.5 Flare](https://open.higgsfield.ai/models/marketing-studio/image/flare)                | up to 4k         |             from $0.0095 |     $0.0126 |      25% |
| [Marketing Studio Image — 2.0 Alpha](https://open.higgsfield.ai/models/marketing-studio/image)                      | up to 4k         |             from $0.0121 |     $0.0162 |      25% |
| [Grok Imagine 2.0](https://open.higgsfield.ai/models/xai/grok-imagine-image-2.0)                                    | up to 2k         |               from $0.04 |           — |        — |
| [Soul Standard](https://open.higgsfield.ai/models/higgsfield-ai/soul/standard)                                      | up to 1080p      |             from $0.0938 |           — |        — |
| [Soul 2 Standard](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard)                                 | up to 1080p      |             from $0.0032 |           — |        — |
| [Ideogram 4.0](https://open.higgsfield.ai/models/ideogram/v4.0)                                                     | —                |                    $0.03 |           — |        — |
| [Z-Image Turbo](https://open.higgsfield.ai/models/z-image/turbo)                                                    | up to 2k         |                   $0.015 |           — |        — |
| [Qwen Image 3 — Edit](https://open.higgsfield.ai/models/alibaba/qwen-image-3/edit)                                  | up to 2k         |               from $0.04 |           — |        — |
| [Qwen Image 3 — Text to Image](https://open.higgsfield.ai/models/alibaba/qwen-image-3/text-to-image)                | up to 2k         |               from $0.04 |           — |        — |
| [Recraft 4.1 — Utility Text to Image](https://open.higgsfield.ai/models/recraft/v4.1/utility/text-to-image)         | up to 1k         |                   $0.035 |           — |        — |
| [Recraft 4.1 — Text to Image](https://open.higgsfield.ai/models/recraft/v4.1/text-to-image)                         | up to 1k         |                   $0.035 |           — |        — |
| [Recraft 4.1 — Pro Text to Image](https://open.higgsfield.ai/models/recraft/v4.1/pro/text-to-image)                 | up to 2k         |                    $0.21 |           — |        — |
| [Recraft 4.1 — Utility Pro Text to Image](https://open.higgsfield.ai/models/recraft/v4.1/utility/pro/text-to-image) | up to 2k         |                    $0.21 |           — |        — |

## Video prices

Rates below are **per second**, not per clip.

| Model / mode                                                                                                                            | Resolution label | Duration label | Advertised USD per second | Regular USD | Discount |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------- | ------------------------: | ----------: | -------: |
| [Seedance 2.5 — Text to Video](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video)                                  | up to 720p       | 4s / 30s       |               from $0.144 |     $0.2057 |      30% |
| [Seedance 2.5 — Reference to Video (with video reference)](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video) | up to 720p       | 4s / 30s       |              from $0.1728 |     $0.2468 |      30% |
| [Seedance 2.5 — Video Edit](https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-edit)                                        | up to 720p       | 4s / 30s       |              from $0.1728 |     $0.2468 |      30% |
| [Seedance 2.5 — Image to Video](https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video)                                | up to 720p       | 4s / 30s       |               from $0.144 |     $0.2057 |      30% |
| [Seedance 2.5 — Video Extend](https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-extend)                                    | up to 720p       | 4s / 30s       |              from $0.1728 |     $0.2468 |      30% |
| [Seedance 2.0 — Text to Video](https://open.higgsfield.ai/models/bytedance/seedance-2.0/text-to-video)                                  | up to 4k         | 4s / 15s       |              from $0.0985 |     $0.1407 |      30% |
| [Seedance 2.0 — Reference to Video (with video reference)](https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video) | up to 4k         | 4s / 15s       |              from $0.1182 |     $0.1688 |      30% |
| [Seedance 2.0 — Image to Video](https://open.higgsfield.ai/models/bytedance/seedance-2.0/image-to-video)                                | up to 4k         | 4s / 15s       |              from $0.0985 |     $0.1407 |      30% |
| [Kling 3.0 — Text to Video (4K)](https://open.higgsfield.ai/models/kling-video/v3.0/4k/text-to-video)                                   | —                | 3s / 15s       |                     $0.21 |       $0.42 |      50% |
| [Kling 3.0 — Image to Video (Pro)](https://open.higgsfield.ai/models/kling-video/v3.0/pro/image-to-video)                               | —                | 3s / 15s       |               from $0.056 |      $0.112 |      50% |
| [Kling 3.0 — Text to Video (Standard)](https://open.higgsfield.ai/models/kling-video/v3.0/std/text-to-video)                            | —                | 3s / 15s       |                    $0.042 |      $0.084 |      50% |
| [Kling 3.0 — Image to Video (Standard)](https://open.higgsfield.ai/models/kling-video/v3.0/std/image-to-video)                          | —                | 3s / 15s       |               from $0.042 |      $0.084 |      50% |
| [Kling 3.0 — Text to Video (Turbo)](https://open.higgsfield.ai/models/kling-video/v3.0-turbo/text-to-video)                             | up to 1080p      | 3s / 15s       |               from $0.056 |      $0.112 |      50% |
| [Kling 3.0 — Text to Video (Pro)](https://open.higgsfield.ai/models/kling-video/v3.0/pro/text-to-video)                                 | —                | 3s / 15s       |               from $0.056 |      $0.112 |      50% |
| [Kling 3.0 — Image to Video (Turbo)](https://open.higgsfield.ai/models/kling-video/v3.0-turbo/image-to-video)                           | up to 1080p      | 3s / 15s       |               from $0.056 |      $0.112 |      50% |
| [Kling 3.0 — Image to Video (4K)](https://open.higgsfield.ai/models/kling-video/v3.0/4k/image-to-video)                                 | —                | 3s / 15s       |                     $0.21 |       $0.42 |      50% |
| [Kling 3.0 — Motion Control (Standard)](https://open.higgsfield.ai/models/kling-video/v3/motion-control/std)                            | —                | 1s             |                    $0.063 |      $0.126 |      50% |
| [Kling 3.0 — Motion Control (Pro)](https://open.higgsfield.ai/models/kling-video/v3/motion-control/pro)                                 | —                | 1s             |                    $0.084 |      $0.168 |      50% |
| [Kling 2.6 — Image to Video (Pro)](https://open.higgsfield.ai/models/kling-video/v2.6/pro/image-to-video)                               | —                | 5s / 10s       |              from $0.0385 |       $0.07 |      45% |
| [Kling 2.6 — Text to Video (Pro)](https://open.higgsfield.ai/models/kling-video/v2.6/pro/text-to-video)                                 | —                | 5s / 10s       |              from $0.0385 |       $0.07 |      45% |
| [Kling 2.6 — Motion Control (Standard)](https://open.higgsfield.ai/models/kling-video/motion-control/std)                               | —                | 1s             |                   $0.0385 |       $0.07 |      45% |
| [Kling 2.6 — Motion Control (Pro)](https://open.higgsfield.ai/models/kling-video/motion-control/pro)                                    | —                | 1s             |                   $0.0616 |      $0.112 |      45% |
| [Kling 2.5 — Image to Video (Standard)](https://open.higgsfield.ai/models/kling-video/v2.5-turbo/standard/image-to-video)               | up to 720p       | 5s / 10s       |                   $0.0231 |      $0.042 |      45% |
| [Kling 2.5 — Image to Video (Pro)](https://open.higgsfield.ai/models/kling-video/v2.5-turbo/pro/image-to-video)                         | up to 1080p      | 5s / 10s       |                   $0.0385 |       $0.07 |      45% |
| [Kling 2.5 — Text to Video (Pro)](https://open.higgsfield.ai/models/kling-video/v2.5-turbo/pro/text-to-video)                           | up to 1080p      | 5s / 10s       |                   $0.0385 |       $0.07 |      45% |
| [Kling O1 (Omni) — Image Reference](https://open.higgsfield.ai/models/kling-video/omni/image-reference)                                 | —                | 3s / 10s       |              from $0.0462 |      $0.084 |      45% |
| [Kling O1 (Omni) — Video Reference](https://open.higgsfield.ai/models/kling-video/omni/video-reference)                                 | —                | 3s / 10s       |              from $0.0693 |      $0.126 |      45% |
| [Kling O1 (Omni) — Video Edit](https://open.higgsfield.ai/models/kling-video/omni/video-edit)                                           | —                | 1s             |                   $0.0693 |      $0.126 |      45% |
| [Kling O1 (Omni) — First/Last Frame](https://open.higgsfield.ai/models/kling-video/omni/first-last-frame)                               | —                | 5s / 10s       |              from $0.0462 |      $0.084 |      45% |
| [Kling O3 — Video Edit](https://open.higgsfield.ai/models/kling-video/o3/video-edit)                                                    | —                | 1s             |                   $0.0693 |      $0.126 |      45% |
| [Kling O3 — First/Last Frame](https://open.higgsfield.ai/models/kling-video/o3/first-last-frame)                                        | —                | 3s / 15s       |              from $0.0462 |      $0.084 |      45% |
| [Kling O3 — Video Reference](https://open.higgsfield.ai/models/kling-video/o3/video-reference)                                          | —                | 3s / 10s       |              from $0.0693 |      $0.126 |      45% |
| [Kling O3 — Image Reference](https://open.higgsfield.ai/models/kling-video/o3/image-reference)                                          | —                | 3s / 15s       |                   $0.0462 |      $0.084 |      45% |
| [Wan 3.0 Prime — Image to Video](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/image-to-video)                                | up to 1080p      | 2s / 30s       |              from $0.0476 |      $0.068 |      30% |
| [Wan 3.0 Prime — Reference to Video](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/reference-to-video)                        | up to 1080p      | 2s / 30s       |              from $0.0476 |      $0.068 |      30% |
| [Wan 3.0 Prime — Text to Video](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/text-to-video)                                  | up to 1080p      | 2s / 30s       |              from $0.0476 |      $0.068 |      30% |
| [Genjutsu — Motion Transfer](https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0)                                | up to 720p       | 1s / 30s       |               from $0.159 |      $0.318 |      50% |
| [Genjutsu — Object Swap](https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0)                                        | up to 720p       | 1s / 30s       |               from $0.159 |      $0.318 |      50% |
| [Cinema Studio 4.0](https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0)                                                     | up to 720p       | 4s / 30s       |              from $0.2057 |           — |        — |
| [MiniMax Hailuo 2.3 — Image to Video (Standard)](https://open.higgsfield.ai/models/minimax/hailuo-2.3/standard/image-to-video)          | —                | 6s / 10s       |              from $0.0117 |     $0.0467 |      75% |
| [MiniMax Hailuo 2.3 — Text to Video (Standard)](https://open.higgsfield.ai/models/minimax/hailuo-2.3/standard/text-to-video)            | up to 768p       | 6s / 10s       |              from $0.0117 |     $0.0467 |      75% |
| [Wan 2.6 — Text to Video](https://open.higgsfield.ai/models/wan/v2.6/text-to-video)                                                     | up to 1080p      | 5s / 10s / 15s |                from $0.05 |        $0.1 |      50% |
| [Wan 2.6 — Image to Video](https://open.higgsfield.ai/models/wan/v2.6/image-to-video)                                                   | up to 1080p      | 5s / 10s / 15s |                from $0.05 |        $0.1 |      50% |
| [Wan 2.6 — Reference to Video](https://open.higgsfield.ai/models/wan/v2.6/reference-to-video)                                           | up to 1080p      | 5s / 10s       |                from $0.05 |        $0.1 |      50% |
| [Wan 2.7 — Image to Video](https://open.higgsfield.ai/models/wan/v2.7/image-to-video)                                                   | up to 1080p      | 2s / 15s       |                from $0.05 |        $0.1 |      50% |
| [Wan 2.7 — Reference to Video](https://open.higgsfield.ai/models/wan/v2.7/reference-to-video)                                           | up to 1080p      | 2s / 10s       |                from $0.05 |        $0.1 |      50% |
| [Wan 2.7 — Text to Video](https://open.higgsfield.ai/models/wan/v2.7/text-to-video)                                                     | up to 1080p      | 2s / 15s       |                from $0.05 |        $0.1 |      50% |
| [Wan 3.0 — Image to Video](https://open.higgsfield.ai/models/alibaba/wan-3.0/image-to-video)                                            | up to 1080p      | 2s / 30s       |               from $0.025 |       $0.05 |      50% |
| [Wan 3.0 — Reference to Video](https://open.higgsfield.ai/models/alibaba/wan-3.0/reference-to-video)                                    | up to 1080p      | 2s / 30s       |               from $0.025 |       $0.05 |      50% |
| [Wan 3.0 — Text to Video](https://open.higgsfield.ai/models/alibaba/wan-3.0/text-to-video)                                              | up to 1080p      | 2s / 30s       |               from $0.025 |       $0.05 |      50% |
| [Happy Horse 1.0 — Text to Video](https://open.higgsfield.ai/models/alibaba/happy-horse/text-to-video)                                  | up to 1080p      | 3s / 15s       |               from $0.098 |       $0.14 |      30% |
| [Happy Horse 1.0 — Image to Video](https://open.higgsfield.ai/models/alibaba/happy-horse/image-to-video)                                | up to 1080p      | 2s / 15s       |               from $0.098 |       $0.14 |      30% |
| [Happy Horse 1.0 — Reference to Video](https://open.higgsfield.ai/models/alibaba/happy-horse/reference-to-video)                        | up to 1080p      | 2s / 15s       |               from $0.098 |       $0.14 |      30% |
| [Happy Horse 1.1 — Text to Video](https://open.higgsfield.ai/models/alibaba/happy-horse/v1.1/text-to-video)                             | up to 1080p      | 3s / 15s       |               from $0.098 |       $0.14 |      30% |
| [Happy Horse 1.1 — Image to Video](https://open.higgsfield.ai/models/alibaba/happy-horse/v1.1/image-to-video)                           | up to 1080p      | 2s / 15s       |               from $0.098 |       $0.14 |      30% |
| [Happy Horse 1.1 — Reference to Video](https://open.higgsfield.ai/models/alibaba/happy-horse/v1.1/reference-to-video)                   | up to 1080p      | 2s / 15s       |               from $0.098 |       $0.14 |      30% |
| [MiniMax H3 — Image to Video](https://open.higgsfield.ai/models/minimax/h3/image-to-video)                                              | up to 2K         | 5s / 15s       |                    $0.091 |       $0.13 |      30% |
| [MiniMax H3 — Reference to Video](https://open.higgsfield.ai/models/minimax/h3/reference-to-video)                                      | up to 2K         | 5s / 15s       |                    $0.091 |       $0.13 |      30% |
| [MiniMax H3 — Text to Video](https://open.higgsfield.ai/models/minimax/h3/text-to-video)                                                | up to 2K         | 5s / 15s       |                    $0.091 |       $0.13 |      30% |
| [LTX 2.5 Fast — Image to Video](https://open.higgsfield.ai/models/lightricks/ltx-2.5/image-to-video/fast)                               | up to 4k         | 6s / 8s / 10s  |                from $0.09 |           — |        — |
| [LTX 2.5 Fast — Text to Video](https://open.higgsfield.ai/models/lightricks/ltx-2.5/text-to-video/fast)                                 | up to 4k         | 6s / 8s / 10s  |                from $0.09 |           — |        — |
| [LTX 2.5 Pro — Image to Video](https://open.higgsfield.ai/models/lightricks/ltx-2.5/image-to-video/pro)                                 | up to 1080p      | 6s / 8s / 10s  |                from $0.12 |           — |        — |
| [LTX 2.5 Pro — Text to Video](https://open.higgsfield.ai/models/lightricks/ltx-2.5/text-to-video/pro)                                   | up to 1080p      | 6s / 8s / 10s  |                from $0.12 |           — |        — |
| [PixVerse 6 — Image to Video](https://open.higgsfield.ai/models/pixverse/v6/image-to-video)                                             | up to 1080p      | 1s / 15s       |                   $0.0978 |      $0.115 |      15% |
| [PixVerse 6 — Text to Video](https://open.higgsfield.ai/models/pixverse/v6/text-to-video)                                               | up to 1080p      | 1s / 15s       |                   $0.0978 |      $0.115 |      15% |
| [Grok Imagine Video 1.5](https://open.higgsfield.ai/models/xai/grok-imagine-video/v1.5/reference-to-video)                              | up to 1080p      | 1s / 15s       |                from $0.08 |           — |        — |

## Why a starting price is not a quote

The [Marketing Studio Alpha playground](https://open.higgsfield.ai/models/marketing-studio/image/playground) showed these examples, with auto aspect ratio:

| Resolution | Quality | Discounted USD | Regular USD | Evidence                          |
| ---------- | ------- | -------------: | ----------: | --------------------------------- |
| 1K         | Low     |        $0.0121 |     $0.0162 | Model pricing text                |
| 2K         | Low     |        $0.0167 |     $0.0222 | Model pricing text                |
| 2K         | High    |          $0.33 |       $0.44 | Selected Generate button estimate |
| 4K         | High    |        $0.5414 |     $0.7219 | Model pricing text                |

Alpha's page stated 25% off until **September 28**. Other discount expiry dates were not verified. No generation was submitted for this research.

For a simple duration-priced configuration, rate × billable seconds provides a preliminary estimate; additional inputs and settings may change it. Do not assume every duration is accepted or every rate applies to every configuration.

## Using this with TypeSafe / Jev

1. Code filters to endpoints whose actual input schemas support the task and which our adapter implements. Catalog presence alone does not make a model runnable in Comfy.
2. Jev can rank the eligible choices for task suitability. Price alone cannot establish likeness, editing quality, lip-sync quality or success rate; keep untested quality unknown.
3. Choose model **and settings**, then obtain a fresh provider estimate. Our existing `/higgsfield/estimate` path in `cloudflare/jobs.ts` already calls the provider estimate endpoint with resolved parameters.
4. Code checks that quote against the remaining authorized budget before submission. Record actual usage and user acceptance afterward.

This file is a reference artifact; no router or new model integration was implemented by creating it. Model page paths are retained for lookup and require endpoint/schema verification before execution.

## Refresh and provenance

Refresh from the primary pricing tables before budget decisions, after promotions expire, or when a required model/configuration changes. Capture video pages 1–3 and the image page, expanding every family; update both files together.

The separate comparison-provider table was excluded: it is dated September 16 and uses specific configurations with some different rates. The primary table also has incomplete resolution cells (including 4K variants), which are preserved without guessing.

Verification: 80 unique variant URLs, 66 video + 14 image; all model paths, resolution labels, duration labels and raw price strings matched the extracted browser catalog. No account balances, credentials or personal photos are included.
