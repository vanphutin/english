# Local Operations Guide

This application runs only on the owner's laptop. PostgreSQL is the source of truth for the curriculum, attempts, evaluations, and learning history.

## Start the application

From `D:\Projects\english`:

```powershell
pnpm start:local
```

The command starts Docker Desktop if necessary, starts PostgreSQL, applies pending migrations with `prisma migrate deploy`, then runs the web app, API, and worker. It does not reset the database.

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`
- API documentation: `http://localhost:3001/docs`

Stop the foreground process with `Ctrl+C`. PostgreSQL may remain running so the next startup is faster. Use `pnpm db:down` when you explicitly want to stop the container.

## Diagnose local services

```powershell
pnpm diagnostics
```

This read-only check reports Docker, PostgreSQL health, API health, and web availability. It never prints the OpenAI key or learner answers.

## Back up learning data

```powershell
pnpm backup
```

Backups are written to `backups/english-YYYYMMDD-HHMMSS.dump`. The command prints a SHA-256 checksum. The `backups/` directory is ignored by Git because it contains personal learning history.

Copy important backups to another trusted local drive. Do not upload them to a public repository.

## Restore a backup

Restore replaces the current local database. Stop the web/API/worker first, verify the exact file, then run:

```powershell
pnpm restore -- -BackupPath "backups\english-YYYYMMDD-HHMMSS.dump" -ConfirmRestore
```

The restore script refuses to run without `-ConfirmRestore` and automatically creates a fresh safety backup immediately before changing the database. After restore, run `pnpm db:migrate` and restart the app so a backup from an older release is safely upgraded.

## Upgrade the project

After updating source files:

```powershell
pnpm install
pnpm db:up
pnpm db:migrate
pnpm contracts:validate
pnpm test
pnpm test:e2e
pnpm build
```

`db:migrate` uses deployment mode and never proposes resetting the learning database. Schema authors use `pnpm db:migrate:dev` only while intentionally creating a new forward-only migration.

## Recovery rules

- Never run `prisma migrate reset` against the personal database.
- Never edit a migration that has already been applied.
- Never commit `.env`, `backups/`, build output, traces, or screenshots containing personal data.
- If AI evaluation fails, attempts remain auditable and provider failure contributes no negative mastery evidence.
