import fs from 'fs';
import path from 'path';
import { computeSha256 } from './idempotency-lease-manager.js';

export interface StoredArtifactRef {
  artifactPath: string;
  storageUri: string;
  contentHash: string;
  created: boolean;
}

export class ContentFactoryStorageRepository {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), 'var', 'content-factory');
  }

  /**
   * Persists an immutable artifact. Re-delivery of identical bytes is idempotent;
   * attempting to overwrite the same path with different bytes fails closed.
   */
  public saveArtifact(runId: string, filename: string, content: string): StoredArtifactRef {
    const runDir = path.join(this.baseDir, runId);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    const filePath = path.join(runDir, filename);
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const contentHash = computeSha256(content);
    let created = true;
    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, 'utf8');
      const existingHash = computeSha256(existingContent);
      if (existingHash !== contentHash) {
        throw new Error(`ARTIFACT_IMMUTABILITY_VIOLATION:${filename}`);
      }
      created = false;
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }

    const storageUri = `file://${filePath.replace(/\\/g, '/')}`;

    return {
      artifactPath: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
      storageUri,
      contentHash,
      created,
    };
  }

  /** Removes only a newly-created file when the surrounding DB transaction rolls back. */
  public removeArtifact(runId: string, filename: string): void {
    const filePath = path.join(this.baseDir, runId, filename);
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  }

  public readArtifact(runId: string, filename: string): string | null {
    const filePath = path.join(this.baseDir, runId, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }
}
