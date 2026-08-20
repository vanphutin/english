# Module Boundaries and Project Structure

## Proposed monorepo layout

```text
apps/
  web/                 # learner UI; no domain authority
  api/                 # HTTP composition root and auth boundary
  worker/              # AI evaluation/outbox/background jobs
packages/
  contracts/           # generated API types + JSON Schemas (not this prose folder)
  domain/              # framework-free value objects and policies
  config/              # typed configuration
  observability/       # logging, tracing, metrics
modules/
  identity/
  grammar-kb/
  curriculum/
  practice/
  evaluation/
  learning/
  vocabulary/
  operations/
  engagement/
openapi/
content/               # reviewed source bundles; no user data
prisma/                 # schema and migrations if Prisma is approved
contracts/              # human-readable governing contracts
```

Each backend module SHOULD contain `domain/`, `application/`, `infrastructure/`, and `transport/`. Domain code cannot import framework, ORM, HTTP, provider SDK, or another module's infrastructure.

## Ownership matrix

| Module     | Owns                                                | May call/read                                           | Must not own                            |
| ---------- | --------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| Identity   | users, preferences, authorization context           | auth adapter                                            | learning rules                          |
| Grammar KB | points, versions, rules, examples, relationships    | operations publication                                  | user mastery                            |
| Curriculum | releases, levels, units, enrollments                | Grammar KB public queries                               | grammar content body                    |
| Practice   | sessions, plans, exercises, attempts                | Curriculum, Grammar KB, Vocabulary; requests Evaluation | AI provider SDK, mastery writes         |
| Evaluation | evaluator orchestration, findings, AI metadata      | immutable exercise/attempt views                        | curriculum/progression                  |
| Learning   | mastery ledger/projection, review, unlock policy    | effective evaluation events, Curriculum                 | evaluating prose                        |
| Vocabulary | lexical content, hints, hint events                 | exercise context                                        | grammar grading                         |
| Operations | publication workflow, audit, prompt/model registry  | module admin ports                                      | learner flows                           |
| Engagement | stories, quests, achievements, consistency, reports | Practice and Learning public events/read models         | mastery writes, grading, provider calls |

## Allowed communication

- Synchronous reads/commands through explicitly exported application interfaces.
- Durable asynchronous effects through outbox-backed domain events.
- Shared primitives (`Result`, IDs, clock interface) from a minimal domain package.
- No cross-module ORM relations exposed as navigable application objects. Foreign keys may exist physically, but repositories remain owned.
- No direct frontend access to database or AI providers.

## Public module interfaces (minimum)

- Grammar KB: `getPublishedGrammarPoint`, `resolveVersion`, `validateDependencyGraph`.
- Curriculum: `getActiveRelease`, `getLearnerPlacement`, `evaluateUnlockInputs`.
- Practice: `startSession`, `getNextSessionItem`, `submitAttempt`, `revealHint`.
- Evaluation: `requestEvaluation`, `getEffectiveEvaluation`, `overrideEvaluation`.
- Learning: `recordEvaluationEvidence`, `getMasterySnapshot`, `getDueReviews`.
- Vocabulary: `getHintsForExercise`, `recordHintReveal`.
- Engagement: `getJourney`, `chooseStoryBranch`, `getMistakeNotebook`, `getDailyChoices`, `getWeeklyReflection`.

## Dependency direction

Transport -> Application -> Domain. Infrastructure implements ports declared inward. Composition roots wire dependencies. Circular module imports are forbidden and checked in CI.
