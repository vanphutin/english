import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentFactoryStorageRepository } from './storage-repository.js';

const testDir = path.resolve(__dirname, '../../../../var/test-content-factory-storage');

describe('ContentFactoryStorageRepository', () => {
  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('treats identical artifact redelivery as idempotent', () => {
    const repository = new ContentFactoryStorageRepository(testDir);
    const first = repository.saveArtifact('run-1', 'artifact.json', '{"ok":true}');
    const second = repository.saveArtifact('run-1', 'artifact.json', '{"ok":true}');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.contentHash).toBe(first.contentHash);
  });

  it('fails closed instead of overwriting immutable artifact bytes', () => {
    const repository = new ContentFactoryStorageRepository(testDir);
    repository.saveArtifact('run-1', 'artifact.json', '{"version":1}');

    expect(() => repository.saveArtifact('run-1', 'artifact.json', '{"version":2}')).toThrow(
      'ARTIFACT_IMMUTABILITY_VIOLATION',
    );
  });
});
