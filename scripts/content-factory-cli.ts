import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ContentFactoryOrchestratorService } from '../modules/operations/src/content-factory/content-factory-orchestrator.service.js';
import { ContentFactoryStorageRepository } from '../modules/operations/src/content-factory/storage-repository.js';
import { Cf4ApprovedBatchRepository } from '../modules/operations/src/content-factory/cf4-approved-batch-repository.js';
import { createCf4Runtime } from '../modules/operations/src/content-factory/cf4-runtime.js';

const prisma = new PrismaClient();
const orchestrator = new ContentFactoryOrchestratorService(prisma);

function optionalBatchSize(value: string | undefined): number {
  if (!value) return 5;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 3 || parsed > 5) {
    throw new Error('CF4_BATCH_SIZE_MUST_BE_3_TO_5');
  }
  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === 'help') {
    console.log(`
Content Factory CLI (CF0–CF4)

Usage:
  pnpm content-factory:cli -- <command> [options]

Commands:
  start-run                         Create a new ContentFactoryRun draft
  plan-manifest <runId>             Generate and validate autonomous manifest (CF2)
  cf4-plan-batches <manifestRunId> [maxBatchSize]
                                    List exact CF4 batches from an OWNER APPROVED manifest
  cf4-run-batch <runId> <manifestRunId> <batchCode> [maxBatchSize]
                                    Run one approved CF4 batch through author/review/exercise/preflight/regression/retry
  enqueue <runId> <code> <content>  Enqueue a job
  claim-next <workerId> [runId]     Worker claims next available job
  status <runId>                    View run status and statistics
  approval-scope <runId>            Print exact scope hash for owner review
  approve-batch <runId> <scopeHash> <owner> <rationale> <APPROVE:scopeHash>
                                    Record owner approval (human-only operation)

CF4 provider config:
  CONTENT_FACTORY_AUTHOR_PROVIDER=OPENAI|SECONDARY
  OPENAI_API_KEY, OPENAI_AUTHORING_MODEL, OPENAI_REVIEW_MODEL
  SECONDARY requires SECONDARY_AI_ENABLED=true,
  CONTENT_FACTORY_SECONDARY_GOLDEN_APPROVED=true, and a VERIFIED live capability probe.

Status: DRAFT ONLY / READY FOR OWNER APPROVAL — CLI DOES NOT PUBLISH
`);
    return;
  }

  try {
    switch (command) {
      case 'start-run': {
        const run = await orchestrator.startRun();
        console.log(`✅ Started ContentFactoryRun ID: ${run.id}`);
        console.log(`   Status: ${run.status}`);
        console.log(`   Policy Version: ${run.policyVersion}`);
        break;
      }

      case 'plan-manifest': {
        const runId = args[1];
        if (!runId) {
          console.error('❌ Missing runId argument');
          process.exit(1);
        }

        const res = await orchestrator.planManifest(runId);
        console.log(`\n==================================================`);
        console.log(`✅ AUTONOMOUS MANIFEST DRAFT GENERATED (CF2)`);
        console.log(`==================================================`);
        console.log(
          `- Total Points Count: ${res.plannerResult.totalPointsCount} (Envelope Target: 230–265)`,
        );
        console.log(
          `- Published Stable Codes Preserved: ${res.plannerResult.publishedStableCodesPreservedCount} / 62`,
        );
        console.log(
          `- Grammar Dimension Coverage Pass Rate: ${res.plannerResult.coverageReport.dimensionPassRate}% (17/17 Dimensions)`,
        );
        console.log(`- Validation Job Status: ${res.validationJob.state}`);
        console.log(`- Manifest Artifact Path: ${res.manifestRef.artifactPath}`);
        console.log(`\n--- CEFR Level Distribution ---`);
        for (const [cefr, count] of Object.entries(res.plannerResult.coverageReport.byCefr)) {
          console.log(`   ${cefr}: ${count} points`);
        }
        console.log(`\n--- Grammar Dimensions Covered ---`);
        for (const detail of res.plannerResult.coverageReport.coverageDetails) {
          console.log(
            `   [${detail.covered ? '✓' : '✗'}] ${detail.dimension}: ${detail.count} points`,
          );
        }
        break;
      }

      case 'cf4-plan-batches': {
        const manifestRunId = args[1];
        if (!manifestRunId) throw new Error('Missing manifestRunId argument');
        const maximumBatchSize = optionalBatchSize(args[2]);
        const repository = new Cf4ApprovedBatchRepository(
          prisma,
          new ContentFactoryStorageRepository(),
        );
        const plan = await repository.loadPlan(manifestRunId, maximumBatchSize);
        console.log(`\n==================================================`);
        console.log(`✅ CF4 APPROVED MANIFEST BATCH PLAN`);
        console.log(`==================================================`);
        console.log(`Manifest: ${plan.manifestCode} v${plan.manifestVersion}`);
        console.log(`Maximum batch size: ${plan.maximumBatchSize}`);
        for (const level of plan.levels) {
          console.log(
            `\n${level.cefr}: ${level.totalPoints} points / ${level.batchCount} batches / ${level.reviewProfile} review / ${level.exerciseTargetPerPoint} exercises per point`,
          );
          for (const batch of level.batches) {
            console.log(
              ` - ${batch.batchCode}: ${batch.points.map((point) => point.code).join(', ')}`,
            );
          }
        }
        console.log(`\nStatus: READY TO START BOUNDED CF4 RUNS — NOT PUBLISHED`);
        break;
      }

      case 'cf4-run-batch': {
        const runId = args[1];
        const manifestRunId = args[2];
        const batchCode = args[3];
        if (!runId || !manifestRunId || !batchCode) {
          throw new Error('Missing runId, manifestRunId, or batchCode');
        }
        const maximumBatchSize = optionalBatchSize(args[4]);
        const runtime = await createCf4Runtime({ prisma, runId });
        const batch = await runtime.batchRepository.loadBatch({
          manifestRunId,
          batchCode,
          maximumBatchSize,
        });
        const result = await runtime.runBatch({
          manifestRunId,
          batch,
          workerPrefix: `cf4-cli:${batchCode}`,
        });

        console.log(`\n==================================================`);
        console.log(`✅ CF4 BATCH EXECUTION COMPLETE`);
        console.log(`==================================================`);
        console.log(`Batch: ${batch.batchCode} (${batch.cefr})`);
        console.log(
          `Author: ${runtime.providers.author.provider}/${runtime.providers.author.model}`,
        );
        console.log(
          `Reviewer: ${runtime.providers.reviewer.provider}/${runtime.providers.reviewer.model}`,
        );
        console.log(
          `Preflight: ${runtime.providers.preflight.provider}/${runtime.providers.preflight.model}`,
        );
        console.log(`Secondary probe: ${runtime.providers.secondaryProbeStatus}`);
        console.log(`Repair status: ${result.repairStatus}`);
        console.log(`Readiness: ${result.report.status}`);
        console.log(`Ready points: ${result.report.readyCount}/${result.report.targetCount}`);
        console.log(`Regression passed: ${result.report.regression.passed}`);
        for (const repair of result.repairs) {
          console.log(
            ` - ${repair.code}: ${repair.status} grammarAttempt=${repair.grammarAttempt ?? '-'} exerciseAttempt=${repair.exerciseAttempt ?? '-'} error=${repair.errorCode ?? '-'}`,
          );
        }
        console.log(
          `\nStatus: ${result.report.status === 'READY_FOR_APPROVAL' ? 'READY FOR OWNER APPROVAL' : 'DRAFT ONLY'} — NOT PUBLISHED`,
        );
        break;
      }

      case 'enqueue': {
        const runId = args[1];
        const targetCode = args[2];
        const inputContent =
          args[3] ?? JSON.stringify({ code: targetCode, license: 'PUBLIC_CONTENT' });

        if (!runId || !targetCode) {
          console.error('❌ Missing required arguments: runId targetCode');
          process.exit(1);
        }

        const res = await orchestrator.enqueueJob({
          runId,
          purpose: 'PLAN_MANIFEST',
          targetCode,
          inputContent,
        });

        console.log(`✅ Enqueued Job ID: ${res.job.id}`);
        console.log(`   Target Code: ${res.job.targetCode}`);
        console.log(`   Idempotency Key: ${res.job.idempotencyKey}`);
        console.log(`   Is Duplicate: ${res.isDuplicate}`);
        break;
      }

      case 'claim-next': {
        const workerId = args[1] ?? 'worker-cli-1';
        const runId = args[2];
        const job = await orchestrator.claimNextJob(workerId, runId);
        if (!job) {
          console.log(`ℹ️ No QUEUED or expired jobs available to claim for worker ${workerId}.`);
        } else {
          console.log(`✅ Claimed Job ID: ${job.id}`);
          console.log(`   Target Code: ${job.targetCode}`);
          console.log(`   State: ${job.state}`);
          console.log(`   Worker ID: ${job.workerId}`);
          console.log(`   Lease Expires At: ${job.leaseExpiresAt?.toISOString()}`);
        }
        break;
      }

      case 'status': {
        const runId = args[1];
        if (!runId) {
          console.error('❌ Missing runId argument');
          process.exit(1);
        }
        const run = await prisma.contentFactoryRun.findUnique({
          where: { id: runId },
          include: { jobs: true, approvals: true },
        });
        if (!run) {
          console.error(`❌ ContentFactoryRun ${runId} not found`);
          process.exit(1);
        }
        console.log(`=== ContentFactoryRun Status ===`);
        console.log(`Run ID: ${run.id}`);
        console.log(`Status: ${run.status}`);
        console.log(
          `Budget: requests ${run.usedRequests}/${run.maxRequests}, input ${run.usedInputTokens}/${run.maxInputTokens}, output ${run.usedOutputTokens}/${run.maxOutputTokens}, estimated cost ${run.usedCost}/${run.maxEstimatedCost}`,
        );
        console.log(`Total Jobs: ${run.jobs.length}`);
        console.log(`Approvals Count: ${run.approvals.length}`);
        for (const j of run.jobs) {
          console.log(
            ` - [${j.state}] ${j.purpose} ${j.targetCode} (Attempt ${j.attempt}, Worker: ${j.workerId ?? 'none'}, Error: ${j.normalizedErrorCode ?? '-'})`,
          );
        }
        break;
      }

      case 'approval-scope': {
        const runId = args[1];
        if (!runId) throw new Error('Missing runId argument');
        const scopeHash = await orchestrator.getApprovalScopeHash(runId);
        console.log(`READY FOR OWNER APPROVAL\nScope hash: ${scopeHash}`);
        break;
      }

      case 'approve-batch': {
        // This command records an owner approval decision.
        // It MUST only be invoked by a human operator, never programmatically by Antigravity.
        // Contract: "Antigravity may prepare the approval report but cannot create the owner decision."
        // See contracts/content-factory/05-publication-and-versioning.md
        const runId = args[1];
        const scopeHash = args[2];
        const owner = args[3];
        const rationale = args[4];
        const confirmation = args[5];

        if (!runId || !scopeHash || !owner || !rationale || !confirmation) {
          console.error('❌ Missing runId, scopeHash, owner, rationale, or exact confirmation');
          process.exit(1);
        }

        const approval = await orchestrator.recordOwnerApproval({
          runId,
          approvedBy: owner,
          rationale,
          expectedScopeHash: scopeHash,
          confirmation,
        });
        console.log(`\n==================================================`);
        console.log(`✅ RECORDED OWNER APPROVAL`);
        console.log(`==================================================`);
        console.log(`- Run ID: ${runId}`);
        console.log(`- Approved By: ${approval.approvedBy}`);
        console.log(`- Rationale: ${approval.rationale}`);
        console.log(`- Scope Hash: ${approval.scopeHash}`);
        console.log(`- Approval Hash: ${approval.approvalHash}`);
        console.log(`- Status: OWNER APPROVED (publication remains a separate gated operation)`);
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  const code = err instanceof Error ? err.message.split(':')[0] : 'UNKNOWN_ERROR';
  console.error(`Fatal CLI Error: ${code}`);
  process.exit(1);
});
