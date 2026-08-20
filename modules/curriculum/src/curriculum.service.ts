import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../../packages/contracts/schemas/curriculum-release.schema.json';
import type { CurriculumReleaseSpec, CurriculumRepository, CurriculumView } from './types.js';

export class CurriculumService {
  constructor(private readonly repository: CurriculumRepository) {}
  async importDraft(input: unknown): Promise<void> {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(input)) throw new Error(`CURRICULUM_INVALID:${ajv.errorsText(validate.errors)}`);
    const spec = input as unknown as CurriculumReleaseSpec;
    await this.repository.importDraft(
      spec,
      createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
    );
  }
  async publish(code: string, version: number): Promise<void> {
    await this.repository.publish(code, version);
  }
  async getActive(): Promise<CurriculumView | null> {
    return this.repository.getActive();
  }
}
