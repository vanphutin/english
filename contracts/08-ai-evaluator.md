# AI Evaluator Contract

## Role and trust boundary

The evaluator proposes structured linguistic judgments. It does not update mastery, unlock levels, publish content, authorize access, or choose database identifiers. Its output is untrusted until schema and policy validation pass.

## Evaluation dimensions

1. `meaningPreservation`: core propositions and context preserved.
2. `targetGrammar`: required target used correctly and naturally.
3. `otherGrammar`: non-target grammatical correctness.
4. `vocabulary`: lexical choice and collocation.
5. `mechanics`: spelling, capitalization, punctuation.
6. `naturalness`: advisory unless awkwardness changes meaning/target validity.

Meaning and target grammar are separate. A grammatical sentence with changed meaning may require retry; a semantically correct alternative absent from references may be accepted.

## Structured output (conceptual)

```json
{
  "schemaVersion": "1.0",
  "dispositionRecommendation": "ACCEPT_WITH_FEEDBACK",
  "dimensions": {
    "meaningPreservation": { "status": "PASS", "confidence": 0.96 },
    "targetGrammar": { "status": "PASS", "confidence": 0.94 },
    "otherGrammar": { "status": "MINOR_ISSUES", "confidence": 0.9 }
  },
  "findings": [
    {
      "category": "SPELLING",
      "code": "SPELLING_TYPO",
      "severity": "MINOR",
      "evidenceText": "livd",
      "messageVi": "...",
      "suggestedFix": "lived"
    }
  ],
  "correctedAnswer": "...",
  "feedbackVi": "...",
  "acceptedAlternative": true,
  "uncertaintyReasons": []
}
```

A strict JSON Schema with `additionalProperties: false` MUST govern production output.

## Deterministic adjudication

Application policy converts the recommendation into the final disposition:

- `ACCEPT`: meaning and target pass; no major/blocking finding.
- `ACCEPT_WITH_FEEDBACK`: meaning and target pass; only minor non-target issues.
- `RETRY`: meaning or target fails with adequate confidence and actionable feedback.
- `SYSTEM_REVIEW`: low confidence, contradictory output, invalid schema after retries, suspected ambiguous exercise, or provider failure without safe fallback.

The learner is never penalized for `SYSTEM_REVIEW` or a system-generated ambiguous item.

## Layered evaluation

1. Normalize safely without rewriting learner meaning.
2. Run deterministic checks (empty/length/language, obvious exact/reference match, prohibited input).
3. Optionally use LanguageTool/parser signals as evidence, never sole truth for target semantics.
4. Call LLM with minimal pinned context and strict structured output.
5. Validate schema, spans, enumerations, score ranges, and contradictions.
6. Apply deterministic adjudication and persist trace metadata.

## Privacy, cost, and reliability

- Do not send user identity, email, or unrelated history.
- Raw provider payloads are not logged by default. Store redacted/minimal metadata and controlled samples only with policy/consent.
- Timeout, retry with jitter, circuit-break, and maximum calls per attempt are required.
- Same attempt/evaluator version is idempotent; concurrent completions cannot both become effective.
- Track latency, tokens, estimated cost, model, prompt/schema versions, error codes, and provider request ID.

## Approved provider

- Use the OpenAI API as the initial provider through a provider-neutral adapter.
- The OpenAI API key is supplied through local environment configuration and MUST never be committed or returned to the browser.
- Evaluation is asynchronous-capable: the API may acknowledge an attempt before the evaluation completes, and the web UI resumes/polls safely.

## Durable execution contract

- Submitting an attempt MUST create the immutable `attempt` and one `ATTEMPT_EVALUATION_REQUESTED` outbox event in the same database transaction.
- The HTTP process MUST NOT call OpenAI. It returns `202` with attempt status `SUBMITTED`; clients poll the owned attempt endpoint.
- A worker claims due events with a bounded lease and PostgreSQL `FOR UPDATE SKIP LOCKED`. An expired lease is recoverable after process termination.
- Job payloads contain identifiers only. The worker reloads the minimum evaluator context from authoritative database records.
- Transient failures (`TIMEOUT`, transport errors, HTTP 408/409/429/5xx) retry with bounded exponential backoff. Configuration, authentication, and invalid-schema failures do not retry indefinitely.
- After the configured maximum, persist `SYSTEM_REVIEW`, mark the event dead-lettered, and record zero-weight mastery evidence.
- An effective evaluation is unique by processing policy: reprocessing first checks existing effective output, rebuilds idempotent mastery evidence, then publishes the event.
- Worker logs and `safe_metadata_json` MUST exclude learner answers, prompts, API keys, raw provider payloads, and user identity.

## Overrides and regression fixtures

Human overrides create a new evaluation with reason, actor, and `supersedes_id`; they trigger a compensating mastery event if needed. Maintain fixtures for correct alternatives, literal mistranslations, target avoidance, wrong tense, Vietnamese/English mixing, typos, prompt injection, empty/very long input, and ambiguous source contexts.
