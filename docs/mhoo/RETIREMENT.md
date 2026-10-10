# MHOO frontend deprecation

MHOO Studio is the destination for new application work. This fork is retained
for source history, workflow examples, and legacy canvas access while retirement
is reconciled. The upstream ComfyUI project remains independent and can still be
used with a separate GPU/Python execution service, including RunPod.

## What remains in service

- `/00/studio/` is the Studio application.
- `/00/comfy/` remains the legacy canvas until saved workflow editing/export and
  canvas-only finishing have a verified replacement or explicit disposition.
- `/00/comfy/api/` remains a shared backend contract. Studio consumes film and
  media routes there. Do not redirect this prefix to an HTML application.
- The `mhoo-comfy` Worker, its storage, jobs, renderer, and workflows remain
  necessary services. Their names do not make them obsolete frontend resources.

The Worker source in this fork is historical. Do not deploy it over the current
Studio backend merely to retire the frontend. Use the current backend release
source and its release process for any shared-service change.

## Retirement gate

Before removing the canvas entry point or its Pages origin, account for saved
workflows/settings, JSON import/export, job history and archived media playback,
reference selection, planner preview, and Clip/Sequence/Compose/Export controls.
Keep the workflow examples under `docs/mhoo/workflows/` and the useful MHOO
service code in maintained source custody. Retaining source alone does not prove
that existing users can reach the same functionality in Studio.

Do not archive the repository until unique relevant work is remote and consumer
checks prove the remaining routes safe. Reconcile outstanding deployment PRs
before anyone uses them; do not merge them as part of deprecation.

No service deletion, credential change, storage migration, upstream ComfyUI
uninstall, GPU shutdown, or repository archival is part of this documentation
change. Rollback is a revert of this documentation commit; no live rollback is
needed because route behavior is unchanged.
