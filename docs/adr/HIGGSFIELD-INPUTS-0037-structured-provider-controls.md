# ADR-HIGGSFIELD-INPUTS-0037: Structured provider controls in the Higgsfield graph

Date: 2026-09-29

## Status

Proposed

## Context

The Higgsfield adapter's graph uses a two-item array to represent a node link.
Provider reference lists and custom shot objects therefore cannot be added as
raw graph arrays without changing saved workflow parsing. Existing single-image
inputs also carry approval-bound private reference tokens.

## Decision

Keep graph serialization compatible. Add catalog-declared text formats for
newline-separated reference URLs and element IDs, and JSON custom shots. Parse
them into validated provider arrays before estimates and submissions. Use the
existing reference approval and transfer boundary after conversion. Omit the top-level
duration when custom shots are supplied; the provider sums their durations for
generation and billing, and its optional scalar has a separate 15-second bound.

Use model output kind to accept generated videos in finishing; retain private
archive validation before rendering. Include the engine suite in the existing
unit Actions workflow.

Changing all graph inputs to arbitrary arrays was rejected because it would
make links ambiguous and require a broader workflow migration. Separate numbered
sockets for every possible reference were rejected because supported lists can
contain 30 images. A new form framework was unnecessary for these bounded inputs.

## Consequences

### Positive

- Saved singular sockets and workflow links retain their meaning.
- Invalid structured input fails before upstream paid generation starts.
- Reference approval, estimates and generation share one conversion path.

### Negative

- Custom-shot JSON is an advanced input; a visual shot editor remains future work.
- Extra reference lists have no native multi-file picker.
- Schema and mock verification still require separate live provider acceptance.

## Notes

[Capability evidence and remaining limits](../mhoo/CAPABILITY-GAPS.md) distinguish
branch support, documented provider behavior and unverified MCP parity.
