# Domain Model

## Bounded contexts

- **Identity:** user identity, preferences, locale, consent.
- **Grammar KB:** grammar concepts, versions, relationships, rules, examples, error patterns.
- **Curriculum:** levels, units, releases, unlock requirements, grammar placement.
- **Practice:** session planning, exercises, sentences, hints, attempts.
- **Evaluation:** deterministic checks, AI calls, structured verdicts, human overrides.
- **Learning:** mastery evidence, projections, review scheduling, progression.
- **Vocabulary:** lexical entries, context-sensitive hints, learner hint history.
- **Operations:** content publication, model/prompt registry, audit and telemetry.
- **Engagement:** stories, quests, achievements, collections, consistency, and reports derived from authoritative learning events.

## Core aggregates

### GrammarPoint

Stable identity for one teachable distinction, e.g. `PP_EXPERIENCE`, not a broad chapter such as “Present Perfect.” It owns versioned definitions, rules, examples, error patterns, and relationships.

### CurriculumRelease

An immutable published graph of levels/units/items. Drafts may change; publication pins exact GrammarPoint versions and ordering.

### LearningSession

A bounded practice episode for one user. It owns a generated plan and exercise order, but not mastery state.

### Exercise

A concrete prompt with context, target(s), constraints, reference alternatives, generation provenance, and content snapshot. Exercises may be curated or generated. Once shown, their evaluable snapshot is immutable.

### Attempt

One learner submission for one exercise and retry index. It owns normalized input, hint usage snapshot, timestamps, and evaluation lifecycle.

### Evaluation

A versioned assessment of an attempt. It contains structured dimensions, findings, accepted correction/alternatives, confidence, provenance, and disposition. Multiple evaluations may exist; exactly one is effective.

### UserGrammarMastery

A projection per `(user, grammar_point)` built from immutable MasteryEvents. It is not updated by controllers or AI adapters directly.

## Key value objects/enums

- `CefrLevel`: `A1 | A2 | B1 | B2 | C1 | C2`.
- `ContentStatus`: `DRAFT | IN_REVIEW | PUBLISHED | RETIRED`.
- `RelationshipType`: `PREREQUISITE | CONTRASTS_WITH | BUILDS_ON | OFTEN_CONFUSED_WITH | PART_OF`.
- `ExerciseType`: initially `TRANSLATE_CONTEXT`, extensible without changing grading semantics.
- `AttemptStatus`: `SUBMITTED | EVALUATING | EVALUATED | NEEDS_REVIEW | FAILED`.
- `Disposition`: `ACCEPT | ACCEPT_WITH_FEEDBACK | RETRY | SYSTEM_REVIEW`.
- `FindingCategory`: `TARGET_GRAMMAR | OTHER_GRAMMAR | MEANING | VOCABULARY | SPELLING | PUNCTUATION | STYLE`.
- `Severity`: `INFO | MINOR | MAJOR | BLOCKING`.
- `MasteryBand`: `UNSEEN | LEARNING | PRACTICING | MASTERED | REVIEW_DUE | AT_RISK`.
- IDs are opaque UUIDs externally. Human-readable codes are stable unique identifiers, never foreign keys in runtime APIs.

## Invariants

- A published GrammarPoint version cannot be edited.
- A prerequisite graph must be acyclic; contrast/confusion relationships may be symmetric.
- An exercise MUST pin exact grammar version(s) and evaluator rubric version.
- One attempt belongs to exactly one user and one exercise; retries are distinct attempts.
- An evaluation never changes the learner submission.
- An evaluation marked effective supersedes any prior effective evaluation transactionally.
- Each effective evaluation produces at most one mastery event per targeted grammar point.
- User mastery cannot exist for a missing GrammarPoint identity.
- Deleting a user anonymizes/erases personal data according to policy while preserving non-identifying aggregate integrity.

## Domain events

`CurriculumPublished`, `SessionStarted`, `ExercisePresented`, `HintRevealed`, `AttemptSubmitted`, `EvaluationCompleted`, `EvaluationOverridden`, `MasteryEvidenceRecorded`, `ReviewScheduled`, `LevelUnlocked`, `SessionCompleted`.

Events are internal integration contracts. Persist important events through an outbox; do not treat in-memory events as durable evidence.

Engagement adds `StorySceneCompleted`, `StoryBranchChosen`, `UnitChallengeCompleted`, `LearnerErrorPatternChanged`, `AchievementGranted`, and `MeaningfulLearningDayRecorded`. These events never substitute for mastery evidence.
