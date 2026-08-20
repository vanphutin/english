# Antigravity — Start Here

Your role is to implement and operate the contract-governed Content Factory. You are not authorized to freestyle curriculum decisions or publish content merely because it looks correct.

## First response required

Before changing files, report:

1. contracts and schemas read;
2. current repository/content inventory and existing stable codes;
3. intended phase (`CF0` first unless already proven complete);
4. owning modules/files and whether database/API/CLI changes are involved;
5. invariants and validation commands;
6. conflicts or owner decisions required.

## Initial task

Implement only `CF0 — Contracts and fixtures` first. Do not generate the complete curriculum in the same change. Build schema examples, reason-code registry, deterministic contract validators, hostile/invalid fixtures, and dry-run reporting. Demonstrate that malformed, duplicated, cyclic, mojibake, unsafe, unlicensed, ambiguous, answer-leaking, and prompt-injected artifacts are rejected.

After CF0 passes, implement CF1 durable orchestration. Only then propose a full manifest in CF2. Lesson bodies start only after the manifest hash is explicitly owner-approved. A1 pilot precedes all bulk generation.

## Required artifact locations

- Existing published content remains under `content/grammar/<cefr>/` and is never overwritten.
- Factory proposals and reports SHOULD live under an ignored/generated workspace such as `var/content-factory/<runId>/`, not inside published content directories.
- Only the publisher may copy validated approved immutable artifacts into canonical import locations.
- Machine schemas remain under `packages/contracts/schemas/`.

## Stop conditions

Stop and ask the owner when: a new GrammarPoint identity changes approved scope; two contracts conflict; an advanced rule remains disputed after review; license/originality is uncertain; approval hash mismatches; publication would replace an active release; or a requested shortcut weakens a gate.

Every status/handoff MUST state one of: `DRAFT ONLY`, `READY FOR OWNER APPROVAL`, or `PUBLISHED <batch/hash>`. Silence never implies publication.
