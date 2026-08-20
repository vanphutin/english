import { describe, expect, it, vi } from 'vitest';
import { PracticeService } from './practice.service.js';
import type { PracticeRepository } from './types.js';
const startSession = vi.fn<PracticeRepository['startSession']>();
const getDailyChoices = vi.fn<PracticeRepository['getDailyChoices']>();
const getNext = vi.fn<PracticeRepository['getNext']>();
const getSession = vi.fn<PracticeRepository['getSession']>();
const listRevealedHints = vi.fn<PracticeRepository['listRevealedHints']>();
const revealNextHint = vi.fn<PracticeRepository['revealNextHint']>();
const completeSession = vi.fn<PracticeRepository['completeSession']>();
const repo: PracticeRepository = {
  getDailyChoices,
  startSession,
  getNext,
  getSession,
  listRevealedHints,
  revealNextHint,
  completeSession,
};
describe('PracticeService', () => {
  it('delegates daily choice policy reads without accepting client targets', async () => {
    getDailyChoices.mockResolvedValue([]);
    await expect(new PracticeService(repo).getDailyChoices('u')).resolves.toEqual([]);
    expect(getDailyChoices).toHaveBeenCalledWith('u');
  });
  it('uses the same request hash for equivalent target order', async () => {
    startSession.mockResolvedValue({
      id: 's',
      status: 'ACTIVE',
      mode: 'FOCUSED',
      startedAt: '2026-08-16T00:00:00Z',
    });
    const service = new PracticeService(repo);
    await service.startSession('u', 'key', { mode: 'FOCUSED', grammarPointIds: ['b', 'a'] });
    const first = startSession.mock.calls[0]?.[2];
    await service.startSession('u', 'key', { mode: 'FOCUSED', grammarPointIds: ['a', 'b'] });
    expect(startSession.mock.calls[1]?.[2]).toBe(first);
  });
  it('delegates owned next-item reads', async () => {
    getNext.mockResolvedValue(null);
    await expect(new PracticeService(repo).getNext('u', 's')).resolves.toBeNull();
  });
  it('hashes session identity for safe completion retries', async () => {
    completeSession.mockResolvedValue({
      sessionId: 's',
      completedAt: '2026-08-16T00:00:00Z',
      totalItems: 1,
      completedItems: 1,
      acceptedItems: 1,
      retryItems: 0,
      durationSeconds: 10,
    });
    const service = new PracticeService(repo);
    await service.completeSession('u', 's', 'completion-key');
    await service.completeSession('u', 's', 'completion-key');
    expect(completeSession.mock.calls[0]?.[3]).toBe(completeSession.mock.calls[1]?.[3]);
  });
});
