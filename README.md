# English Grammar Learning

Personal Vietnamese-first English grammar learning application, designed as a TypeScript modular monolith for local use.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop
- An OpenAI API key for evaluating non-reference answers

## First setup

```bash
copy .env.example .env
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm owner:create vanphutin <your-password> "Tên của bạn"
pnpm start:local
```

Web: `http://localhost:3000`  
API: `http://localhost:3001/api/v1`  
API docs: `http://localhost:3001/docs`

`pnpm start:local` starts Docker Desktop when needed, starts PostgreSQL, safely applies pending migrations, then starts the web app, API, and durable evaluation worker together. Attempt submission returns immediately; the browser polls while the worker evaluates it.

Useful local operations:

```bash
pnpm diagnostics
pnpm backup
pnpm test:e2e
```

See `docs/local-operations.md` before restoring a backup. Use `pnpm evaluator:golden` to validate the regression corpus or `pnpm evaluator:golden:live` to run it against the configured OpenAI model.

## Required reading

The governing product and engineering decisions live in `contracts/README.md`. Contributors and coding agents must read the relevant contracts before changing behavior.

## Quality checks

```bash
pnpm contracts:validate
pnpm db:validate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```
