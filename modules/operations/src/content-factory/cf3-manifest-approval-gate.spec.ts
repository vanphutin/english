import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaCf3ManifestApprovalGate } from './cf3-manifest-approval-gate.js';
import { ContentFactoryStorageRepository } from './storage-repository.js';
import type { PilotGrammarTarget } from './lesson-generator.js';

const prisma = new PrismaClient();
const storageDir = path.resolve(__dirname, '../../../../var/test-cf3-manifest-gate');

const target: PilotGrammarTarget = {
  code: 'A1_GATE_POINT',
  family: 'BE_VERB',
  canonicalSlug: 'a1-gate-point',
  titleVi: 'Chủ điểm gate',
  titleEn: 'Gate point',
  assessableDistinction: 'Learner selects one bounded A1 grammar distinction correctly.',
  communicativeFunctions: ['introduce people'],
  formBoundary: 'Use one bounded present be pattern.',
  meaningBoundary: 'Express one simple identity meaning.',
  useBoundary: 'Do not use the pattern outside the defined identity context.',
  prerequisites: [],
  buildsOn: [],
  contrastsWith: [],
  oftenConfusedWith: [],
  vocabularyDomains: ['PEOPLE'],
  rationale: 'A bounded point used to verify the production approval gate.',
  sortOrder: 1,
  cefr: 'A1',
};

describe('PrismaCf3ManifestApprovalGate', () => {
  let runId: string;
  let gate: PrismaCf3ManifestApprovalGate;

  beforeEach(async () => {
    const run = await prisma.contentFactoryRun.create({ data: { status: 'DRAFT ONLY' } });
    runId = run.id;
    gate = new PrismaCf3ManifestApprovalGate(
      prisma,
      new ContentFactoryStorageRepository(storageDir),
    );
  });

  afterEach(async () => {
    if (runId) await prisma.contentFactoryRun.delete({ where: { id: runId } }).catch(() => {});
    if (fs.existsSync(storageDir)) fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('rejects a manifest run that has not been owner approved', async () => {
    await expect(
      gate.assertApprovedTargets({ manifestRunId: runId, targets: [target] }),
    ).rejects.toThrow('CF3_REQUIRES_OWNER_APPROVED_MANIFEST_RUN');
    expect(await prisma.contentFactoryApproval.count({ where: { runId } })).toBe(0);
  });

  it('does not trust an OWNER APPROVED status without an approval record', async () => {
    await prisma.contentFactoryRun.update({
      where: { id: runId },
      data: { status: 'OWNER APPROVED', manifestHash: 'f'.repeat(64) },
    });

    await expect(
      gate.assertApprovedTargets({ manifestRunId: runId, targets: [target] }),
    ).rejects.toThrow('CF3_MANIFEST_APPROVAL_EVIDENCE_MISSING');
    expect(await prisma.contentFactoryApproval.count({ where: { runId } })).toBe(0);
  });
});
