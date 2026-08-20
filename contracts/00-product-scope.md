# Product Scope and Non-goals

## Product outcome

Build a Vietnamese-first application that helps learners actively produce English sentences and progressively master grammar. A learning turn is:

`Vietnamese context -> target grammar -> learner writes English -> deterministic checks + AI evaluation -> feedback/retry/accept -> mastery update -> next item`

New levels add grammar; they never remove older material. Practice selection mixes new targets, scheduled review, and weak points.

## MVP audience

- Vietnamese-speaking English learners.
- Curriculum target: complete progression from beginner/A1 through C2.
- Web client first; the API MUST remain usable by future mobile clients.

## MVP capabilities

- Versioned grammar knowledge base generated comprehensively by AI and validated before publication.
- Curriculum levels and ordered units with prerequisites.
- Guided sentence-production exercises from Vietnamese contexts.
- Structured AI evaluation, explanations, retries, and accepted alternatives.
- Mastery, spaced review, level progression, and learning history.
- Vocabulary hints that assist without giving away the whole answer.
- Authoring/import/validation workflow for grammar content, even if the first admin UI is deferred.
- Observability of AI cost, latency, model/prompt versions, and failures.
- A varied A1-C2 journey with multiple activities, optional stories, unit challenges, personal error remediation, meaningful achievements, topic preferences, gentle consistency, and capability-based progress reflection.

## Explicit non-goals for MVP

- Official CEFR certification or a guarantee that the app's placement exactly matches an examination board.
- Open-ended chatbot tutoring or social/community features.
- Speech recognition, pronunciation grading, handwriting, OCR, or video lessons.
- Replacing the curriculum with on-demand LLM generation.
- Publishing AI output that has not passed schema, graph, duplication, evaluator-fixture, and safety validation.
- High-stakes certification or an official CEFR examination score.
- Public leaderboards, punitive lives/energy, paid virtual currency, loot boxes, or streak mechanics that erase progress.
- Copying/scraping a proprietary curriculum. External sources may inform independent editorial work only when licensing permits.
- Microservices, event streaming infrastructure, or multi-region deployment before measured need.

## Product invariants

1. AI may author the full curriculum, but only validated and versioned published records are runtime source of truth; live LLM output is never consumed directly as curriculum.
2. Every exercise has an explicit learning target and a reproducible generation trace.
3. Evaluation separates grammatical correctness, target usage, and meaning preservation.
4. A technically valid alternative MUST NOT be marked wrong merely for differing from one reference answer.
5. Mastery changes only from accepted, auditable evidence and is never written directly by an LLM.
6. Hints and retries are recorded and reduce evidence strength when appropriate.
7. Published content is immutable by version; edits create a new version.
8. The product must degrade safely if the AI provider is unavailable.

## Success measures (proposed)

- At least 95% of curated acceptance fixtures receive the expected evaluator disposition.
- A learner can complete a full session despite one transient AI failure (retry or safe fallback).
- No progression decision depends solely on a single attempt.
- All accepted attempts can be traced to exercise, content version, evaluator version, and mastery event.
