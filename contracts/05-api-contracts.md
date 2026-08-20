# HTTP API Contract

## Global conventions

- Base path `/api/v1`; JSON UTF-8; timestamps ISO-8601 UTC; opaque UUID identifiers.
- Authenticate with secure session/Bearer mechanism chosen in implementation.
- Request/response shapes are defined in OpenAPI before endpoints are implemented.
- Every mutation accepts `Idempotency-Key`; retrying with the same key and same payload returns the same logical result. A different payload returns `409`.
- Use cursor pagination: `{ data, page: { nextCursor, hasMore } }`.
- Correlation header: `X-Request-Id`. Never expose provider secrets or raw internal exceptions.

## Error envelope

```json
{
  "error": {
    "code": "ATTEMPT_ALREADY_EVALUATED",
    "message": "Human-readable localized message",
    "details": [{ "field": "answer", "reason": "required" }],
    "requestId": "uuid"
  }
}
```

Stable machine codes are mandatory. Expected statuses: `400` malformed, `401`, `403`, `404`, `409` conflict/idempotency, `422` semantic validation, `429`, `503` dependency unavailable.

## Learner endpoints

### Curriculum and progress

- `GET /curriculum` — active release summary and learner placement.
- `GET /curriculum/levels/{levelId}` — units, lock state, aggregate progress; no unpublished content.
- `GET /me/mastery?cursor=&dueBefore=` — mastery projections.
- `GET /me/progress` — level progression, next recommended action, and the complete published roadmap. Each roadmap level includes its status (`COMPLETED | CURRENT | LOCKED`), aggregate percentage, ordered units, and learner-facing GrammarPoint titles from the pinned curriculum release.

### Sessions

- `POST /sessions`
  - Request: `{ "mode": "DAILY|FOCUSED|REVIEW", "grammarPointIds"?: [], "targetMinutes"?: 10 }`
  - Response `201`: session summary plus first item if ready.
- `GET /sessions/{sessionId}` — resumable state and current item.
- `GET /sessions/{sessionId}/next` — current/next presentation; MUST be stable until completed/skipped.
- `POST /sessions/{sessionId}/complete` — idempotent completion and summary.

### Hints and attempts

- `POST /session-items/{itemId}/hints`
  - Request: `{ "level": 1 }`
  - Response: revealed hint plus recorded assistance state.
- `POST /session-items/{itemId}/attempts`
  - Request: `{ "answer": "I have lived here for three years.", "clientSubmittedAt"?: "..." }`
  - Response `201/202`: `{ attemptId, status, evaluation?: EvaluationView, pollAfterMs?: 1000 }`.
- `GET /attempts/{attemptId}` — attempt status and effective evaluation when available.
- `POST /attempts/{attemptId}/retry` is NOT used; submit a new attempt against the same item to preserve history.

## Key response schemas

`ExerciseView` includes `id`, `type`, Vietnamese context/instruction, allowed constraints, progressive hints, and attempt limits. Each target also includes learner-safe guidance from the exact pinned GrammarPoint version: CEFR, Vietnamese learning objective, form patterns, meaning/uses, usage notes, rules, and reviewed bilingual examples. The UI MUST render this source-of-truth guidance rather than inventing grammar explanations client-side. It MUST NOT expose evaluator-only semantic requirements or reference answers before completion.

`EvaluationView` includes:

```json
{
  "disposition": "ACCEPT_WITH_FEEDBACK",
  "dimensions": {
    "targetGrammar": "PASS",
    "meaning": "PASS",
    "otherGrammar": "MINOR_ISSUES"
  },
  "feedbackVi": "...",
  "findings": [
    { "category": "SPELLING", "severity": "MINOR", "messageVi": "...", "suggestedFix": "..." }
  ],
  "correctedAnswer": "...",
  "canRetry": true
}
```

Scores used internally for mastery SHOULD NOT be exposed as gameable precision in the learner UI.

## Admin/content endpoints (later phase)

- Draft CRUD is version-aware and role protected.
- `POST /admin/grammar-bundles/validate` performs schema and semantic validation without publication.
- `POST /admin/curriculum-releases/{id}/publish` requires explicit confirmation and audit entry.
- `POST /admin/evaluations/{id}/override` requires reason and creates a superseding evaluation; it never mutates history.

## Engagement endpoints (phased)

- `GET /me/daily-choices` — policy-owned journey, weakness, and quick-challenge options.
- `GET /me/mistake-notebook` — owner-only grouped error-pattern projection.
- `POST /me/mistake-notebook/{patternId}/practice` — idempotently starts focused remediation.
- `GET /me/story` and `GET /me/story/scenes/{sceneId}` — current versioned journey/scene.
- `POST /me/story/scenes/{sceneId}/choices` — idempotently record one allowed branch choice.
- `GET /me/achievements` — definitions and idempotent grants.
- `GET /me/weekly-reflections` — structured, traceable progress facts and presentation.

Transport schemas are added to OpenAPI in the implementation phase before each endpoint. No endpoint exposes provider selection, prompts, keys, raw payloads, hidden reference answers, or internal mastery coefficients.

## Compatibility

- Additive optional changes are allowed within v1.
- Renames, removals, meaning changes, and enum narrowing require a new API version or an announced deprecation window.
- API contract tests MUST verify implementation against OpenAPI and prevent undocumented fields from becoming relied upon.
