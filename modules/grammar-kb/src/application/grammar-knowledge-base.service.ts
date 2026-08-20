import { createHash } from 'node:crypto';
import { createGrammarBundleValidator, type GrammarBundle } from '@english/contracts';
import type {
  GrammarKnowledgeBaseRepository,
  PublishedGrammarPoint,
} from './grammar-kb.repository.js';

export class GrammarKnowledgeBaseService {
  private readonly validateBundle = createGrammarBundleValidator();
  constructor(private readonly repository: GrammarKnowledgeBaseRepository) {}

  /** Imports only schema-valid drafts and hashes the exact immutable semantic bundle. */
  async importDraft(input: unknown): Promise<void> {
    const result = this.validateBundle(input);
    if (!result.valid) throw new Error(`GRAMMAR_BUNDLE_INVALID: ${result.errors.join('; ')}`);
    if (result.value.status !== 'DRAFT') throw new Error('GRAMMAR_BUNDLE_MUST_BE_DRAFT');
    await this.repository.importDraft(result.value, contentHash(result.value));
  }

  async publish(code: string, version: number): Promise<PublishedGrammarPoint> {
    return this.repository.publish(code, version);
  }

  async getPublished(code: string): Promise<PublishedGrammarPoint | null> {
    return this.repository.findPublished(code);
  }
}

function contentHash(bundle: GrammarBundle): string {
  return createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
}
