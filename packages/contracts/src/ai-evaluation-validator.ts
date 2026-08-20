import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import schema from '../schemas/ai-evaluation.schema.json';

export interface AiEvaluationValidation {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate: ValidateFunction = ajv.compile(schema);

export const aiEvaluationJsonSchema = schema;

export function validateAiEvaluation(value: unknown): AiEvaluationValidation {
  const valid = validate(value);
  return {
    valid,
    errors: valid
      ? []
      : (validate.errors ?? []).map(
          (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
        ),
  };
}
