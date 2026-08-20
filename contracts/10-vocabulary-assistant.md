# Vocabulary Assistant Contract

## Purpose and boundary

Help learners express the intended meaning without turning a grammar exercise into a vocabulary memory test. Vocabulary assistance does not grade grammar and must not reveal the complete answer.

## Hint levels

1. **Concept hint:** Vietnamese meaning, semantic category, or contextual clarification.
2. **Lexical hint:** English lemma or short phrase, optionally part of speech.
3. **Form hint:** inflected form only when vocabulary—not target grammar—is blocking. It MUST NOT reveal the assessed grammar form.

Each reveal is explicit, persisted, and included in mastery evidence weighting.

## Hint generation inputs/outputs

Input: immutable exercise snapshot, target grammar exclusions, learner level, locale, prior reveals. Output: entry/sense ID, relevant surface form, Vietnamese hint, level, position/context, answer-revealing flag, provenance/version.

## Rules

- Use context-specific senses; do not dump full dictionary entries.
- Never reveal a full translated sentence, target auxiliary/inflection, or a phrase that collapses the assessed decision.
- Prefer curated hints for core content. AI-generated hints pass schema, leakage, and safety validation.
- Repeated hint requests return stable content and do not duplicate events.
- Vocabulary mistakes appear as a separate evaluator finding and do not automatically fail correct target grammar unless they alter core meaning.
- Learner lookup/hint history is private user data with retention/export/deletion support.

## History and personalization

Record `exercise`, lexical sense, hint level, timestamp, and session item. Do not infer a permanent “vocabulary weakness” from one lookup. Future vocabulary mastery is a separate aggregate and MUST NOT be smuggled into grammar mastery fields.

## Acceptance cases

- A learner can request progressively stronger hints.
- Target grammar remains unrevealed at every pre-answer hint level.
- Reloading preserves revealed state.
- Assisted success is visibly accepted but contributes less mastery evidence.

## Runtime API contract

- `GET /session-items/{itemId}/hints` returns only hints already revealed by the authenticated learner.
- `POST /session-items/{itemId}/hints/next` reveals at most one next curated hint and persists the reveal before returning it.
- Level 1 responses conceal the English lemma. Levels 2–3 may expose lexical information but never the assessed grammar form or a complete answer.
- Reloading calls the history endpoint; clients never infer reveal history from local state.
