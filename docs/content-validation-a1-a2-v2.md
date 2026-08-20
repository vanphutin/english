# Content Validation Report — A1/A2 Curriculum v2

Date: 2026-08-16  
Batch: `foundation-content-v2`  
Decision: approved for personal local use

## Scope

- 10 published A1 GrammarPoints: 5 existing bootstrap points and 5 newly authored points.
- 10 published A2 GrammarPoints.
- 20 published translation exercises, one primary exercise per GrammarPoint.
- 20 vocabulary senses and 60 progressive hints.
- Curriculum `PERSONAL_ENGLISH` release 2 with ordered A1 and A2 levels.

## Automated validation

- Every new bundle passed the versioned GrammarPoint JSON Schema during import.
- All relationship targets existed when imported; the prerequisite graph remained acyclic.
- All curriculum items pinned an exact published GrammarPoint version.
- Publication retired curriculum release 1 and made release 2 active without mutating release 1.
- Each new point contains three bilingual examples, at least one coded common error, generation policy, evaluation policy, and AI-authoring provenance.
- Each exercise contains Vietnamese context/source, non-exhaustive reference alternatives, explicit semantic requirements, a primary target, and three non-answer-revealing vocabulary hints.

## Database evidence after publication

| Check                 |                Result |
| --------------------- | --------------------: |
| Published A1 points   |                    10 |
| Published A2 points   |                    10 |
| Grammar examples      |                    60 |
| Grammar relationships |                    41 |
| Published exercises   |                    20 |
| Vocabulary entries    |                    20 |
| Vocabulary hints      |                    60 |
| Active curriculum     | `PERSONAL_ENGLISH` v2 |

## Editorial and licensing notes

Content was independently authored for this personal application. No proprietary curriculum was scraped or copied. CEFR labels are editorial estimates rather than certification claims. Reference answers are examples and are not treated as the only acceptable English forms.

## Remaining review risk

Automated checks establish structural and publication safety, but they do not replace prolonged learner feedback. Ambiguity, Vietnamese naturalness, and difficulty calibration should be monitored during real A1/A2 sessions and corrected through new immutable content versions.
