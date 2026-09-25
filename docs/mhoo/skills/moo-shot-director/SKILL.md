---
name: moo-shot-director
description: 'Turn a Moo film scene into motivated blocking, camera coverage, start/end keyframes and timed AI video prompts; use for shot planning and directing tests.'
---

# Moo shot director

Read [research](references/evidence.md). Design the scene before the generation prompt. For memoir chronology use ../moo-story-director/references/project.md; for actor inputs use ../moo-actor-continuity/SKILL.md.

## Three different images

1. **Scene reference / hero image:** an informative moment establishing cast, wardrobe, props, lighting and geography. It can depict a later moment if that best communicates the scene. It is not automatically the video input.
2. **Shot starting keyframe:** the exact visible state before this shot’s action begins.
3. **Optional ending keyframe:** the state this shot earns, with compatible geography, hands, props and movement.

Bind reference roles explicitly: identity, costume, setting, composition or style. Never assume an invented image or ID exists. Describe the scene in creative language first; translate into verified execution fields when submitting. Camera terminology describes intent, not a guaranteed control.

## Direct the moment

Write what the actor is trying to do and a playable physical action. Replace “look sad/cinematic” with behavior grounded in the scene: listen, conceal, hesitate, grip, release, commit. Do not force eye contact with the camera during narrative action just because the portrait uses it.

For each shot give purpose, starting state, one coherent action chain, ending state and sound. Set camera height, subject side, eyeline, entrance/exit and screen direction. Choose shot size and movement for information or emotion: show a hand only if the hand communicates something. Keep foreground/background readable. A deliberately crossed axis must reorient the viewer, not happen accidentally.

Time the actor’s action first. Allocate enough duration for anticipation, action and reaction. Do not cram a complex scene into a single short generation. Prefer one motivated camera move; elaborate vocabulary is not a substitute for staging. Plan a fallback cut or coverage shot where it preserves meaning, not merely to hide failure.

## Output contract

Provide a compact shot card plus separate copyable prompts:

- starting-image prompt: one freezeable instant, no future actions;
- video prompt: initial condition, ordered action beats, camera behavior, continuity invariants, ending hold and sound;
- optional end-image prompt only when useful;
- actual reference inventory and role bindings;
- edit intention and evaluation criteria.

Compare the generated shot to its intended story function. A completed API job or attractive still does not prove identity, movement, acting or continuity. Current classroom worked example: /Users/mhoooo/.codex/outputs/moo-film-research/CLASSROOM-TEST.md.

## Model-specific direction

This skill defines the shot’s creative intent, not a universal model prompt template. Keep the shot card separate from the generation payload. Load only the selected model’s playbook:

- [Kling 2.5](../moo-kling-2-5-director/SKILL.md)
- [Kling 2.6](../moo-kling-2-6-director/SKILL.md)
- [Kling 3.0](../moo-kling-3-0-director/SKILL.md)
- [Seedance 2.5](../moo-seedance-2-5-director/SKILL.md)

Keep prompting approaches, API limits, sources and experiment findings scoped to model/version/variant/mode. Do not transfer a rule across models merely because they serve the same shot. Model-specific evidence can change how the creative brief becomes a prompt, including camera, sequencing and audio treatment. Unverified approaches remain hypotheses.
