export const contractVersion = '0.2.0' as const;

export { createGrammarBundleValidator } from './grammar-bundle-validator.js';
export { aiEvaluationJsonSchema, validateAiEvaluation } from './ai-evaluation-validator.js';
export type { AiEvaluationValidation } from './ai-evaluation-validator.js';
export type { GrammarBundle, GrammarBundleValidation } from './grammar-bundle.types.js';

export * from './content-factory/reason-code-registry.js';
export * from './content-factory/deterministic-validator.js';
export * from './content-factory/dry-run-reporter.js';

