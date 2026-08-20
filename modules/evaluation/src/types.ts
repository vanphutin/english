export type DimensionStatus = 'PASS' | 'MINOR_ISSUES' | 'FAIL' | 'UNCERTAIN';
export type Disposition = 'ACCEPT' | 'ACCEPT_WITH_FEEDBACK' | 'RETRY' | 'SYSTEM_REVIEW';
export interface AiEvaluationOutput {
  schemaVersion: '1.0';
  dispositionRecommendation: Disposition;
  dimensions: Record<
    | 'meaningPreservation'
    | 'targetGrammar'
    | 'otherGrammar'
    | 'vocabulary'
    | 'mechanics'
    | 'naturalness',
    { status: DimensionStatus; confidence: number }
  >;
  findings: Array<{
    category: string;
    code: string;
    severity: 'INFO' | 'MINOR' | 'MAJOR' | 'BLOCKING';
    evidenceText?: string;
    messageVi: string;
    suggestedFix?: string;
  }>;
  correctedAnswer?: string;
  feedbackVi: string;
  acceptedAlternative: boolean;
  uncertaintyReasons: string[];
}
export interface EvaluationContext {
  answer: string;
  activityType: string;
  promptPayload: Record<string, unknown>;
  contextVi: string;
  sourceTextVi: string;
  referenceAnswers: string[];
  semanticRequirements: string[];
  targetGrammar: Array<{ code: string; title: string }>;
}
export interface ProviderResult {
  output: AiEvaluationOutput;
  trace: {
    provider: string;
    model: string;
    status: string;
    latencyMs?: number;
    providerRequestId?: string;
    inputTokens?: number;
    outputTokens?: number;
    errorCode?: string;
  };
}
export interface EvaluationProvider {
  evaluate(context: EvaluationContext): Promise<ProviderResult>;
}
export interface SubmitAttemptInput {
  answer: string;
  clientSubmittedAt?: string;
}
export interface EvaluationView {
  disposition: Disposition;
  dimensions: Record<string, DimensionStatus>;
  feedbackVi: string;
  findings: Array<{ category: string; severity: string; messageVi: string; suggestedFix?: string }>;
  correctedAnswer?: string;
  canRetry: boolean;
}
export interface AttemptView {
  attemptId: string;
  status: string;
  evaluation?: EvaluationView;
}
