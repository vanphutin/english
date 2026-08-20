import { PrismaClient } from '@prisma/client';
import { ContentFactoryOrchestratorService } from '../modules/operations/src/content-factory/content-factory-orchestrator.service.js';

const prisma = new PrismaClient();
const orchestrator = new ContentFactoryOrchestratorService(prisma);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === 'help') {
    console.log(`
Content Factory CLI (CF0–CF2)

Usage:
  node scripts/content-factory-cli.js <command> [options]

Commands:
  start-run                         Create a new ContentFactoryRun draft
  plan-manifest <runId>             Generate and validate autonomous manifest (CF2)
  enqueue <runId> <code> <content>  Enqueue a job
  claim-next <workerId> [runId]     Worker claims next available job
  status <runId>                    View run status and statistics
  approval-scope <runId>            Print exact scope hash for owner review
  approve-batch <runId> <scopeHash> <owner> <rationale> <APPROVE:scopeHash>
                                    Record owner approval (human-only operation)

Status: DRAFT ONLY — NOT READY FOR OWNER APPROVAL — NOT PUBLISHED
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
        console.log(`Total Jobs: ${run.jobs.length}`);
        console.log(`Approvals Count: ${run.approvals.length}`);
        for (const j of run.jobs) {
          console.log(
            ` - [${j.state}] Job ${j.targetCode} (Attempt ${j.attempt}, Worker: ${j.workerId ?? 'none'})`,
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
        console.log(`✅ RECORDED OWNER APPROVAL (CF5)`);
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
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
