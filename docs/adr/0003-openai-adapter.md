# ADR 0003: OpenAI through a provider-neutral adapter

- Status: Accepted
- Date: 2026-08-16

## Decision

Use the OpenAI API for curriculum generation and evaluation behind application-owned ports. Validate all structured output and apply deterministic policies after model calls.

## Consequences

The API key never reaches the browser. Provider/model/prompt/schema versions and safe cost/latency metadata are recorded. Provider failure cannot penalize the learner or directly change mastery.
