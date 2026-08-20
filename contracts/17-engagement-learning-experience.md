# Engagement and Learning Experience Contract

Status: **Approved direction — phased implementation required**  
Contract version: `0.1.0`

## Outcome

Make repeated grammar retrieval feel varied and meaningful without weakening curriculum, evaluation, or mastery integrity. Engagement mechanics MUST reinforce genuine language production; they MUST NOT reward meaningless clicks, punish mistakes, or replace learning evidence with game scores.

## Motivation principles

- **Autonomy:** offer bounded choices of activity, topic, and story branch.
- **Competence:** make improvement, recovered errors, retention, and completed capabilities visible.
- **Meaning:** place grammar inside coherent situations and stories rather than isolated drills only.
- **Safety:** mistakes are evidence for adaptation, not loss of lives or access.
- **Sustainability:** streaks and rewards encourage return without guilt, financial pressure, or dark patterns.

## Feature families

### Activity variety

Initial activity types: `TRANSLATE_CONTEXT`, `CORRECT_ERROR`, `TRANSFORM_SENTENCE`, `COMPLETE_SENTENCE`, `ORDER_WORDS`, `SELECT_IN_CONTEXT`, `GUIDED_WRITING`, and `MINI_DIALOGUE`.

Every activity pins exact GrammarPoint versions, semantic requirements, allowed alternatives, difficulty, generation provenance, and evaluator policy. UI variety MUST NOT redefine grading semantics. A normal session SHOULD follow:

`warm-up -> focused production -> contrast/error task -> contextual challenge -> reflection/next action`

Do not show the same activity type more than twice consecutively when valid alternatives exist.

### Daily choice

The home screen offers up to three policy-owned options:

1. `CONTINUE_JOURNEY` — current curriculum and story progress.
2. `REPAIR_WEAKNESS` — due/weak error or GrammarPoint targets.
3. `QUICK_CHALLENGE` — a short mixed retrieval set.

These are presentation choices over Learning-owned selection policies. The browser never chooses targets or bypasses prerequisites.

### Story Journey

A `StorySeries` contains ordered `StoryChapter` records and versioned scenes. A learner owns `UserStoryProgress`, including current scene and approved branch choices. Each scene may reference exercises but never owns GrammarPoint truth.

- Story content MUST remain comprehensible at the learner's level.
- Branches may change setting, characters, and consequences; they MUST NOT change unlock/mastery policy.
- AI may draft dialogue or scene variants from a validated scene contract.
- Runtime AI continuation is stored as a draft snapshot and validated before presentation.
- Character memory contains story facts only; it MUST NOT contain secrets, authentication data, raw provider payloads, or unrestricted conversation history.
- The learner can skip narrative text and still access equivalent learning evidence.

Policy `story-journey-v1` publishes immutable A1 series content with ordered chapters and scenes.
Each scene optionally pins one published Exercise and exposes that exact learning action independently
from the skippable narrative. A branch changes only the next scene and bounded story facts; it never
changes GrammarPoint targets, evaluation, mastery, or unlock rules. Memory accepts at most 20
key/value story facts (`64/160` characters), rejects arbitrary objects, and never stores account or
provider data. Scene completion and branch choice are owner-only and idempotent.

### Unit challenge

`UnitChallenge` combines multiple required points in one coherent task. It returns a capability breakdown, not a single opaque pass/fail score.

- Failure never removes prior mastery or blocks normal remediation.
- Each assessed GrammarPoint produces separate evidence.
- Missing/system-failed dimensions produce no negative evidence.
- The result proposes targeted remediation quests for unresolved points.

Policy `unit-challenge-v1` snapshots every GrammarPoint in the selected current-level unit when the
challenge starts. Each target result is `PASSED`, `NEEDS_PRACTICE`, or `NO_EVIDENCE`. Only an
effective `ACCEPT`/`ACCEPT_WITH_FEEDBACK` passes; `RETRY` needs practice; missing evaluations and
`SYSTEM_REVIEW` produce `NO_EVIDENCE`. The challenge projection never emits MasteryEvents itself,
so it cannot double-count or turn infrastructure failure into negative learning evidence.

### Personal mistake notebook

The notebook is a projection over attempts/findings, not an editable copy of historical evidence. It groups recurring errors into `LearnerErrorPattern` records containing category/code, affected GrammarPoint, occurrence/recency, trend, representative owner-only snippets, and remediation state.

States: `ACTIVE | IMPROVING | RESOLVED | RECURRED`.

- “Practice this error” requests a focused Practice session; the frontend does not select arbitrary exercises.
- Resolved status requires delayed successful evidence, not one corrected retry.
- Learner excerpts never enter analytics or general AI logs.

Policy `error-pattern-v1` groups non-INFO effective findings by
`(user, grammarPoint, category, code)`. A later accepted evaluation for the same GrammarPoint moves
an active pattern to `IMPROVING` only when it comes from another session. `RESOLVED` requires that
independent session success to occur at least 24 hours after the latest occurrence. A later finding
after resolution produces `RECURRED`. Rebuild replays effective evaluations in completion order and
MUST yield the same projection. Representative excerpts are owner-only references to immutable
attempts; they are never copied into analytics or AI routing.

### Interests and personalization

`LearnerInterestPreference` stores an ordered, user-editable set of approved topic codes. Interests are a ranking signal only. They MUST NOT suppress required curriculum, reduce target coverage, or introduce vocabulary above the controlled ceiling.

Initial topics: daily life, family, study, work, technology, travel, shopping, health, food, entertainment, community, nature, and business.

### Achievements and collection

Achievements recognize meaningful evidence: diverse independent success, repaired recurring errors, delayed retention, story completion, or unit capability. They are derived idempotently from authoritative events.

Prohibited bases: button clicks, provider spending, excessive session length, repeated trivial exercises, or uninterrupted attendance alone. Cosmetics MAY unlock roadmap themes, story postcards, character notes, or chapter extras; they never alter mastery or access to required learning.

### Gentle consistency and daily surprise

A consistency calendar records days with meaningful evidence. Missing a day does not erase history, mastery, rewards, or a best period. Grace/rest days are supported; UI language avoids shame or loss framing.

A daily surprise is an optional micro-story, error puzzle, contextual expression, or short challenge. It MUST match level, pass content validation, have a deterministic daily identity, and never block the normal journey.

#### Phase E6 binding policy (`gentle-consistency-v1`)

- The calendar is a 28-day owner-only projection. Only effective completed evaluations with `ACCEPT`, `ACCEPT_WITH_FEEDBACK`, or `RETRY` count as meaningful evidence; `SYSTEM_REVIEW`, page views, button clicks, provider calls, and elapsed UI time never count.
- A learner may mark a rest day from 30 days in the past through 14 days in the future. Rest-day upsert MUST NOT overwrite an existing learning day. A missed/empty day never deletes history, mastery, achievements, best rhythm, or access.
- `currentRhythm` and `bestRhythm` may include explicit rest days, but `meaningfulDayCount` includes learning evidence only. UI MUST label these as a gentle rhythm rather than a punitive streak.
- Daily surprises are curated, published, level-specific records. Selection is deterministic by `(user, UTC date)` and stored once. Opening a surprise produces no MasteryEvent or meaningful-day evidence.
- Version 1 surprise types are `MICRO_STORY`, `ERROR_PUZZLE`, and `CONTEXT_NOTE`. They remain optional and never block the daily journey.

### Weekly progress reflection

Reports explain capabilities: newly mastered/retained grammar, improving/resolved/recurred errors, independent versus assisted success, topic/vocabulary breadth, and reason-coded next focus. Reports are reproducible from authoritative records. AI may rewrite supplied structured facts into friendly Vietnamese but MUST NOT invent progress claims.

### Phase E5 binding policy (`engagement-growth-v1`)

- A learner stores zero to five unique ordered topic codes from the approved catalog. Replacement is transactional. Practice may use this projection as a tie-break/ranking boost only; required targets, prerequisites, difficulty, vocabulary ceiling, and spaced-review obligations always win.
- Achievement definitions are policy-versioned. A grant is unique per learner and definition, append-only, idempotent, and contains an evidence snapshot with authoritative record identifiers.
- Version 1 grants only `FIRST_INDEPENDENT_SUCCESS`, `GRAMMAR_EXPLORER_5`, `ERROR_REPAIRER`, and `STORY_FINISHER`. Their sources are respectively mastery projections, distinct independently-successful GrammarPoints, resolved error patterns, and completed story progress.
- Weekly intervals are deterministic UTC Monday-to-Monday half-open ranges. A current-week report is upserted by `(user, weekStart)` and may be rebuilt without changing the meaning of its claims.
- Every claim and next-focus item exposes nonempty `sourceRefs`. Presentation text is derived from the same stored fact snapshot. Infrastructure failures, clicks, time-on-page, token cost, and raw AI assertions are never progress evidence.

## Selection and repetition invariants

- Prefer distinct GrammarPoints, activity types, topics, semantic hashes, and story contexts within a session.
- Recent exclusion operates at exercise, semantic group, and context/topic levels.
- Repetition remains intentional for spaced retrieval; “not boring” does not mean “never repeat.”
- A repeated target SHOULD use a different activity or context unless exact recall is the objective.

## Explicit non-goals

- Public leaderboards, leagues, paid coins, loot boxes, energy/hearts, or punitive lives.
- Fully open-ended chatbot replacing curriculum.
- AI deciding mastery, unlock, rewards, or the next required GrammarPoint.
- Mandatory stories, streak pressure, or cosmetics hiding core learning.

## Acceptance criteria

- A five-item normal session contains at least three activity types when content is available.
- No two presented items share the same semantic hash.
- Story branches preserve pinned target and evaluator contracts.
- Unit challenges produce per-target results and safe remediation.
- Error notebook rebuild matches attempts/findings for a fixed policy version.
- Resolved errors require delayed evidence and can return to `RECURRED`.
- Every visible progress claim is traceable to authoritative records.
- All features are keyboard accessible and usable with reduced motion.
