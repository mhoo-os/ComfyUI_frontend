# ADR-MHOO-PRODUCTION-0038: Talking-shot Workflows

Date: 2026-09-25

## Status

Accepted

## Context

The first agentic production target is a single talking shot. Exact speech and
lip-sync are not guaranteed by the verified Seedance endpoint. Existing jobs
already persist paid-submission intent and results in a Durable Object.

## Decision

Add a strict scene/dialogue template that compiles to the documented Seedance
2.5 text-to-video contract. Keep a free template planner and an explicitly
selected Jev/Astra planner. Reuse existing authenticated AI Gateway custom
providers and BYOK aliases; do not widen provider secret scopes.

For new graphs containing the talking-shot node, use Cloudflare Workflows to
checkpoint Jev routing, Astra drafting, plan persistence and execution ticks.
The Durable Object remains the submission ledger, owner queue, cancellation
state and history/event publisher. Its alarms only launch the Workflow for
these jobs; they do not execute the graph. Other graphs retain the existing
alarm runner. A persisted runner value prevents two execution engines from
owning the same job.

Retain submission intent before every paid POST. If an outcome is ambiguous,
stop for reconciliation rather than resubmit. Polling/storage retries cannot
reset the submission ledger. Preserve literal dialogue, duration and format in
code; Astra only supplies a bounded visual scene. Route/schema failures stop
before video submission. Planner calls have bounded time/output and no retries.

## Consequences

Workflows now orchestrates new talking-shot jobs while existing history stays
compatible. Native preview planning does not generate video. Its AI mode uses
planner tokens and is labeled accordingly. Speech quality still requires a
paid acceptance run and human review. Previewing then running AI mode drafts
again; caching/reusing an approved plan remains future work. Planning calls are
not yet immediately cancellable. The WebMCP paid queue remains disabled.
