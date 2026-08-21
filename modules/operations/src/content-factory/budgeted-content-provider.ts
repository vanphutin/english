import type {
  ContentFactoryJsonProvider,
  ContentFactoryJsonRequest,
} from './ai-content-provider.js';
import type { Cf4AiBudgetEstimate, Cf4ExecutionControl } from './cf4-execution-control.js';

/**
 * Run-scoped provider decorator used for provider calls that occur inside a
 * lower-level port (for example exercise-bank preflight) and therefore are not
 * directly visible to the CF4 coordinator budget reservation code.
 */
export class BudgetedContentFactoryJsonProvider implements ContentFactoryJsonProvider {
  public readonly provider: ContentFactoryJsonProvider['provider'];
  public readonly model: string;

  constructor(
    private readonly delegate: ContentFactoryJsonProvider,
    private readonly execution: Cf4ExecutionControl,
    private readonly runId: string,
    private readonly estimate: Cf4AiBudgetEstimate,
  ) {
    this.provider = delegate.provider;
    this.model = delegate.model;
    if (!Number.isInteger(estimate.outputTokens) || estimate.outputTokens <= 0) {
      throw new Error('CONTENT_FACTORY_BUDGETED_PROVIDER_OUTPUT_ESTIMATE_INVALID');
    }
    if (
      estimate.estimatedCost !== undefined &&
      (!Number.isFinite(estimate.estimatedCost) || estimate.estimatedCost < 0)
    ) {
      throw new Error('CONTENT_FACTORY_BUDGETED_PROVIDER_COST_ESTIMATE_INVALID');
    }
  }

  public async generateJson(request: ContentFactoryJsonRequest): Promise<unknown> {
    await this.execution.reserveAiCallBudget({
      runId: this.runId,
      input: `${request.system}\n${request.input}`,
      estimate: this.estimate,
    });
    return this.delegate.generateJson(request);
  }
}
