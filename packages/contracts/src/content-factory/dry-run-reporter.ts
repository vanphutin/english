import type { DeterministicValidationResult } from './deterministic-validator.js';

export type ContentFactoryStatus =
  'DRAFT ONLY' | 'READY FOR OWNER APPROVAL' | `PUBLISHED ${string}`;

export interface DryRunReportParams {
  runId: string;
  phase: string;
  manifestHash?: string;
  validationResult: DeterministicValidationResult;
  status: ContentFactoryStatus;
}

export function generateDryRunReport(params: DryRunReportParams): string {
  const { runId, phase, manifestHash, validationResult, status } = params;
  const { valid, findings, summary } = validationResult;

  const lines: string[] = [];

  lines.push(`# Content Factory Dry-Run Validation Report`);
  lines.push(``);
  lines.push(`- **Run ID**: \`${runId}\``);
  lines.push(`- **Phase**: \`${phase}\``);
  lines.push(`- **Manifest Hash**: \`${manifestHash ?? 'N/A'}\``);
  lines.push(`- **Status**: **\`${status}\`**`);
  lines.push(`- **Validation Passed**: ${valid ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push(``);
  lines.push(`## Finding Summary`);
  lines.push(`- Total Findings: ${summary.totalFindings}`);
  lines.push(`- Blocking Errors: ${summary.blockingCount}`);
  lines.push(`- Errors: ${summary.errorCount}`);
  lines.push(`- Warnings: ${summary.warningCount}`);
  lines.push(`- Info: ${summary.infoCount}`);
  lines.push(``);

  if (findings.length > 0) {
    lines.push(`## Finding Details`);
    lines.push(``);
    lines.push(`| Code | Severity | Artifact | Message | Suggested Action |`);
    lines.push(`| :--- | :---: | :--- | :--- | :--- |`);
    for (const f of findings) {
      lines.push(
        `| \`${f.code}\` | **${f.severity}** | \`${f.artifactPath ?? 'root'}\` | ${f.messageVi} | ${f.suggestedAction ?? 'N/A'} |`,
      );
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Report Status: ${status}*`);

  return lines.join('\n');
}
