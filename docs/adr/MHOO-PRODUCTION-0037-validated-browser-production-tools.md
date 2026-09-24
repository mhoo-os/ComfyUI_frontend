# ADR-MHOO-PRODUCTION-0037: Validated browser production tools

Date: 2026-09-24

## Status

Accepted

## Context

Agents need structured access to the production canvas without depending on
screen coordinates. Generation can spend credits and editing can race a human.
Provider product names do not define valid request schemas.

## Decision

Expose feature-detected native WebMCP inspection, bounded parameter mutation,
queueing and authoritative job reads. Require graph revisions for mutations and
queueing. Keep owner authentication and existing backend validation. Do not expose
arbitrary JavaScript, arbitrary HTTP requests or invented media result injection.

Adopt Script-to-Talking Shot as the first full-stack acceptance target. Plan a
staged Workflows migration and optional Jev/Astra planning behind verified
endpoint contracts. Keep the existing Durable Object runner active until that
migration is implemented and tested. Reject unsupported provider fields rather
than silently changing requested output or retrying a different paid model.

## Consequences

Browser support is optional and changing. Native UI remains usable. WebMCP does
not grant spending authority, guarantee exactly-once execution or supply an
agent. A revision protects against stale edits, not against all side effects in
third-party widget callbacks. Exact speech and lip-sync remain a provider
capability/quality acceptance requirement, not a schema guarantee.

See [validated architecture](../mhoo/AGENTIC-PRODUCTION.md) for sources and gaps.
