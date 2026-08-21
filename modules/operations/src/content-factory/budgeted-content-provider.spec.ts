import { describe, expect, it, vi } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { BudgetedContentFactoryJsonProvider } from './budgeted-content-provider.js';
import type { Cf4ExecutionControl } from './cf4-execution-control.js';

function delegate(): ContentFactoryJsonProvider {
  return {
    provider: 'OPENAI',
    model: 'review-model',
    generateJson: vi.fn(async () => ({ ok: true })),
  };
}

describe('BudgetedContentFactoryJsonProvider', () => {
  it('reserves budget before delegating the provider call', async () => {
    const reserveAiCallBudget = vi.fn(async () => ({
      requests: 1,
      inputTokens: 10,
      outputTokens: 100,
      estimatedCost: 0,
    }));
    const execution = { reserveAiCallBudget } as unknown as Cf4ExecutionControl;
    const raw = delegate();
    const provider = new BudgetedContentFactoryJsonProvider(raw, execution, 'run-id', {
      outputTokens: 100,
      estimatedCost: 0,
    });

    await expect(
      provider.generateJson({ purpose: 'REVIEW', system: 'system', input: '{}' }),
    ).resolves.toEqual({ ok: true });
    expect(reserveAiCallBudget).toHaveBeenCalledOnce();
    expect(vi.mocked(raw.generateJson)).toHaveBeenCalledOnce();
    expect(reserveAiCallBudget.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(raw.generateJson).mock.invocationCallOrder[0]!,
    );
  });

  it('does not call the provider when the budget guard rejects', async () => {
    const execution = {
      reserveAiCallBudget: vi.fn(async () => {
        throw new Error('CF4_RUN_BUDGET_EXHAUSTED');
      }),
    } as unknown as Cf4ExecutionControl;
    const raw = delegate();
    const provider = new BudgetedContentFactoryJsonProvider(raw, execution, 'run-id', {
      outputTokens: 100,
    });

    await expect(
      provider.generateJson({ purpose: 'REVIEW', system: 'system', input: '{}' }),
    ).rejects.toThrow('CF4_RUN_BUDGET_EXHAUSTED');
    expect(raw.generateJson).not.toHaveBeenCalled();
  });

  it('rejects non-finite cost estimates at construction', () => {
    expect(
      () =>
        new BudgetedContentFactoryJsonProvider(
          delegate(),
          {} as Cf4ExecutionControl,
          'run-id',
          { outputTokens: 100, estimatedCost: Number.POSITIVE_INFINITY },
        ),
    ).toThrow('CONTENT_FACTORY_BUDGETED_PROVIDER_COST_ESTIMATE_INVALID');
  });
});
