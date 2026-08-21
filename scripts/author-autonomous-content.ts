/**
 * Direct autonomous authoring is intentionally disabled.
 *
 * Historical versions of this script could author the full A1–C2 manifest when
 * invoked without limits. That bypassed durable jobs, manifest owner approval,
 * the bounded CF3/CF4 batch gates, independent review, exercise readiness,
 * regression evidence, and audit records. Provider-backed authoring now lives
 * in @english/operations and must be invoked only through the Content Factory
 * state machine.
 */
function main(): never {
  throw new Error(
    'DIRECT_AUTONOMOUS_AUTHORING_DISABLED: use the orchestrated CF3 pilot or CF4 level-batch path; ' +
      'direct bulk authoring remains disabled.',
  );
}

main();
