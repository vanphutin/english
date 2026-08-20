import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { GrammarKnowledgeBaseRepository } from './grammar-kb.repository.js';
import { GrammarKnowledgeBaseService } from './grammar-knowledge-base.service.js';

const importDraft = vi.fn<GrammarKnowledgeBaseRepository['importDraft']>();
const publish = vi.fn<GrammarKnowledgeBaseRepository['publish']>();
const findPublished = vi.fn<GrammarKnowledgeBaseRepository['findPublished']>();
const repository: GrammarKnowledgeBaseRepository = { importDraft, publish, findPublished };

describe('GrammarKnowledgeBaseService', () => {
  it('rejects a bundle that fails the governing JSON Schema', async () => {
    const module = await Test.createTestingModule({
      providers: [
        { provide: 'REPOSITORY', useValue: repository },
        {
          provide: GrammarKnowledgeBaseService,
          useFactory: (repo: GrammarKnowledgeBaseRepository) =>
            new GrammarKnowledgeBaseService(repo),
          inject: ['REPOSITORY'],
        },
      ],
    }).compile();
    await expect(
      module.get(GrammarKnowledgeBaseService).importDraft({ code: 'INVALID' }),
    ).rejects.toThrow('GRAMMAR_BUNDLE_INVALID');
  });

  it('delegates published reads without changing domain state', async () => {
    findPublished.mockResolvedValue(null);
    const service = new GrammarKnowledgeBaseService(repository);
    await expect(service.getPublished('MISSING')).resolves.toBeNull();
  });

  it('delegates publication to the transactional repository', async () => {
    const published = {
      code: 'BE_PRESENT',
      family: 'BE',
      version: 1,
      cefr: 'A1',
      title: 'Be',
      learningObjectiveVi: 'Dùng be',
    };
    publish.mockResolvedValue(published);
    await expect(
      new GrammarKnowledgeBaseService(repository).publish('BE_PRESENT', 1),
    ).resolves.toEqual(published);
  });
});
