import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import grammarPointSchema from '../schemas/grammar-point.schema.json';
import type { GrammarBundle, GrammarBundleValidation } from './grammar-bundle.types.js';

export function createGrammarBundleValidator(): (input: unknown) => GrammarBundleValidation {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(grammarPointSchema);

  return (input: unknown): GrammarBundleValidation => {
    if (validate(input)) return { valid: true, value: input as unknown as GrammarBundle };
    return { valid: false, errors: (validate.errors ?? []).map(formatError) };
  };
}

function formatError(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`;
}
