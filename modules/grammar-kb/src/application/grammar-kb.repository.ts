import type { GrammarBundle } from '@english/contracts';

export interface PublishedGrammarPoint {
  code: string;
  family: string;
  version: number;
  cefr: string;
  title: string;
  learningObjectiveVi: string;
}

export interface GrammarKnowledgeBaseRepository {
  importDraft(bundle: GrammarBundle, contentHash: string): Promise<void>;
  publish(code: string, version: number): Promise<PublishedGrammarPoint>;
  findPublished(code: string): Promise<PublishedGrammarPoint | null>;
}
