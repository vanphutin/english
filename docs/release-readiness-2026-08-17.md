# Release Readiness Report

Date: 2026-08-17  
Target: local personal web application  
Result: ready for owner use

## Delivered release surface

- Modular-monolith web, API, worker, PostgreSQL persistence, and local login.
- Durable OpenAI evaluation pipeline with retry/failure isolation and golden fixtures.
- Auditable mastery, review scheduling, level progression, and session selection.
- Published curriculum release 4 with 62 GrammarPoints and exercises from A1 through C2.
- Progressive vocabulary hints and persisted reveal history.

## Browser and accessibility verification

- Automated Chrome E2E covers login, dashboard, session start, exercise display, keyboard focus, hint reveal, answer submission, accepted feedback, and session summary.
- Login accessibility smoke covers Vietnamese document language, associated input labels, password semantics, and keyboard focus order.
- Live local UI audit found no horizontal overflow, unlabeled inputs, unnamed buttons, or browser console warnings/errors.

## Local operations

- `pnpm start:local` starts Docker/PostgreSQL, safely deploys pending migrations, and starts web/API/worker.
- `pnpm diagnostics` checks Docker, PostgreSQL, API, and web availability without exposing secrets or answers.
- `pnpm backup` creates timestamped PostgreSQL custom archives with SHA-256 checksums.
- Restore requires an explicit `-ConfirmRestore` switch and creates a safety backup before replacing data.
- Database startup uses `prisma migrate deploy`; it never proposes resetting personal learning data.

## Security and privacy

- `.env`, backups, Playwright traces, build output, and local data are Git-ignored.
- No API key or session secret was found in repository source.
- Production dependency audit reports no known vulnerabilities after pinning patched `js-yaml` 5.2.2 for Swagger.
- AI/provider failure produces no negative mastery evidence.

## Verification results

- Root and workspace TypeScript checks: passed.
- ESLint and Prettier: passed.
- Unit/domain/API tests: 29 passed.
- Browser E2E/accessibility tests: 2 passed.
- Evaluator golden corpus: 7 cases passed.
- JSON Schemas and Prisma schema: valid.
- All 11 database migrations: applied; no pending migrations.
- Production build: web, API, worker, and all modules passed.
- Local diagnostics: Docker, PostgreSQL, API, and web passed.
- Backup archive: created and verified as a readable PostgreSQL custom archive.

## Residual operational notes

- Advanced CEFR placement is editorial and not an official certification claim.
- Continue correcting content through new immutable versions when real-use feedback reveals ambiguity or unnatural Vietnamese.
- Keep at least one recent backup on another trusted local drive.
- Paid live OpenAI regression (`pnpm evaluator:golden:live`) is optional and intentionally excluded from normal automated checks.
