import type { CapabilityReport } from './types.js';

export type AiPurpose =
  | 'STORY_DRAFT'
  | 'EXERCISE_DRAFT'
  | 'DAILY_SURPRISE_DRAFT'
  | 'TOPIC_CLASSIFICATION'
  | 'FEEDBACK_WORDING'
  | 'GRAMMAR_EVALUATION';
export type PrivacyClass = 'PUBLIC_CONTENT' | 'PSEUDONYMOUS_LEARNING' | 'PRIVATE_STORY';

export interface RoutingDecision {
  provider: 'DETERMINISTIC' | 'SECONDARY_OPENAI_COMPATIBLE' | 'OPENAI' | 'SAFE_FALLBACK';
  reason:
    | 'DETERMINISTIC_SUFFICIENT'
    | 'SECONDARY_CAPABILITY_VERIFIED'
    | 'SECONDARY_NOT_ELIGIBLE'
    | 'SECONDARY_UNHEALTHY'
    | 'PRIMARY_REQUIRED'
    | 'NO_PROVIDER_AVAILABLE';
}

const tierOnePurposes = new Set<AiPurpose>([
  'STORY_DRAFT',
  'EXERCISE_DRAFT',
  'DAILY_SURPRISE_DRAFT',
  'TOPIC_CLASSIFICATION',
]);

/** Provider routing is deterministic policy; model output can never select its own provider. */
export const decideProviderRoute = (input: {
  purpose: AiPurpose;
  privacyClass: PrivacyClass;
  deterministicSufficient: boolean;
  requiresStructuredOutput: boolean;
  secondaryReport?: CapabilityReport;
  secondaryHealthy: boolean;
  openAiAvailable: boolean;
}): RoutingDecision => {
  if (input.deterministicSufficient)
    return { provider: 'DETERMINISTIC', reason: 'DETERMINISTIC_SUFFICIENT' };
  const checks = new Map(
    input.secondaryReport?.checks.map((item) => [item.capability, item.status]) ?? [],
  );
  const secondaryEligible =
    tierOnePurposes.has(input.purpose) &&
    input.privacyClass === 'PUBLIC_CONTENT' &&
    checks.get('AUTH_MODELS') === 'PASS' &&
    checks.get('CHAT_COMPLETIONS') === 'PASS' &&
    checks.get('VIETNAMESE_UNICODE') === 'PASS' &&
    checks.get('PROMPT_INJECTION_BOUNDARY') === 'PASS' &&
    (!input.requiresStructuredOutput || checks.get('STRUCTURED_OUTPUT') === 'PASS');
  if (secondaryEligible && input.secondaryHealthy)
    return {
      provider: 'SECONDARY_OPENAI_COMPATIBLE',
      reason: 'SECONDARY_CAPABILITY_VERIFIED',
    };
  if (input.openAiAvailable)
    return {
      provider: 'OPENAI',
      reason:
        input.purpose === 'GRAMMAR_EVALUATION'
          ? 'PRIMARY_REQUIRED'
          : secondaryEligible
            ? 'SECONDARY_UNHEALTHY'
            : 'SECONDARY_NOT_ELIGIBLE',
    };
  return { provider: 'SAFE_FALLBACK', reason: 'NO_PROVIDER_AVAILABLE' };
};
