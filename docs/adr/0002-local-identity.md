# ADR 0002: Local identity

- Status: Accepted
- Date: 2026-08-16

## Decision

Use one or more local username/password accounts with server-side sessions. Hash passwords through an established password library; never implement password cryptography manually.

## Consequences

There is no external identity dependency. Session secrets remain local environment configuration. Authorization checks remain server-side even though the initial deployment has one user.
