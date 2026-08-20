export { GrammarKnowledgeBaseService } from './application/grammar-knowledge-base.service.js';
export { validateGrammarGraph } from './domain/grammar-graph.js';
export { PrismaGrammarKnowledgeBaseRepository } from './infrastructure/prisma-grammar-kb.repository.js';
export type {
  GrammarKnowledgeBaseRepository,
  PublishedGrammarPoint,
} from './application/grammar-kb.repository.js';
