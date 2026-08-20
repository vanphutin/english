import { describe, expect, it, vi } from 'vitest';
import { CurriculumService } from './curriculum.service.js';
import type { CurriculumRepository } from './types.js';

const importDraft = vi.fn<CurriculumRepository['importDraft']>();
const publish = vi.fn<CurriculumRepository['publish']>();
const getActive = vi.fn<CurriculumRepository['getActive']>();
const repository: CurriculumRepository = { importDraft, publish, getActive };

describe('CurriculumService', () => {
  it('rejects invalid release topology', async () => {
    await expect(
      new CurriculumService(repository).importDraft({ code: 'INVALID' }),
    ).rejects.toThrow('CURRICULUM_INVALID');
  });
  it('delegates active release reads', async () => {
    getActive.mockResolvedValue(null);
    await expect(new CurriculumService(repository).getActive()).resolves.toBeNull();
  });
  it('delegates transactional publication', async () => {
    publish.mockResolvedValue();
    await expect(
      new CurriculumService(repository).publish('PERSONAL_ENGLISH', 1),
    ).resolves.toBeUndefined();
  });
});
