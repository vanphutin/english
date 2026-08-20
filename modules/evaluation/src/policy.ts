import type { AiEvaluationOutput, Disposition } from './types.js';

export function adjudicate(output: AiEvaluationOutput): Disposition {
  const { meaningPreservation, targetGrammar } = output.dimensions;
  if (
    meaningPreservation.status === 'UNCERTAIN' ||
    targetGrammar.status === 'UNCERTAIN' ||
    output.uncertaintyReasons.length > 0
  )
    return 'SYSTEM_REVIEW';
  if (meaningPreservation.status === 'FAIL' || targetGrammar.status === 'FAIL') return 'RETRY';
  if (output.findings.some((finding) => ['MAJOR', 'BLOCKING'].includes(finding.severity)))
    return 'RETRY';
  if (output.findings.some((finding) => finding.severity === 'MINOR'))
    return 'ACCEPT_WITH_FEEDBACK';
  return 'ACCEPT';
}
