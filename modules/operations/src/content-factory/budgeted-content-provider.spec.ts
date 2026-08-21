import { describe, expect, it, vi } from 'vitest';
import type { ContentFactoryJsonProvider } from './ai-content-provider.js';
import { BudgetedContentFactoryJsonProvider } from './budgeted-content-provider.js';
import type { Cf4ExecutionControl } from './cf4-execution-control.js';

function delegate(generateJson = vi.fn(async () => ({ ok: true }))): ContentFactoryJsonProvider {
  return {
    provider: 'OPENAI',
    model: 'review-model',
    generateJson,
  };
}

describe('BudgetedContentFactoryJsonProvider', () => {
  it('reserves budget before delegating the provider call', async () => {
    const order: string[] = [];
    const reserveAiCallBudget = vi.fn(async () => {
      order.push('reserve');
      return { requests: 1, inputTokens: 10, outputTokens: 100, estimatedCost: 0 };
    });
    const generateJson = vi.fn(async () => {
      order.push('delegate');
      return { ok: true };
    });
    const execution = { reserveAiCallBudget } as unknown as Cf4ExecutionControl;
    const provider = new BudgetedContentFactoryJsonProvider(
      delegate(generateJson),
      execution,
      'run-id',
      { outputTokens: 100, estimatedCost: 0 },
    );

    await expect(
      provider.generateJson({ purpose: 'REVIEW', system: 'system', input: '{}' }),
    ).resolves.toEqual({ ok: true });
    expect(order).toEqual(['reserve', 'delegate']);
    expect(reserveAiCallBudget).toHaveBeenCalledOnce();
    expect(generateJson).toHaveBeenCalledOnce();
  });

  it('does not call the provider when the budget guard rejects', async () => {
    const execution = {
      reserveAiCallBudget: vi.fn(async () => {
        throw new Error('CF4_RUN_BUDGET_EXHAUSTED');
      }),
    } as unknown as Cf4ExecutionControl;
    const generateJson = vi.fn(async () => ({ ok: true }));
    const provider = new BudgetedContentFactoryJsonProvider(
      delegate(generateJson),
      execution,
      'run-id',
      { outputTokens: 100 },
    );

    await expect(
      provider.generateJson({ purpose: 'REVIEW', system: 'system', input: '{}' }),
    ).rejects.toThrow('CF4_RUN_BUDGET_EXHAUSTED');
    expect(generateJson).not.toHaveBeenCalled();
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
