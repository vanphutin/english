import fs from 'fs';
import path from 'path';
import { computeSha256 } from './idempotency-lease-manager.js';

export interface StoredArtifactRef {
  artifactPath: string;
  storageUri: string;
  contentHash: string;
}

export class ContentFactoryStorageRepository {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), 'var', 'content-factory');
  }

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
    fs.writeFileSync(filePath, content, 'utf8');

    const contentHash = computeSha256(content);
    const storageUri = `file://${filePath.replace(/\\/g, '/')}`;

    return {
      artifactPath: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
      storageUri,
      contentHash,
    };
  }

  public readArtifact(runId: string, filename: string): string | null {
    const filePath = path.join(this.baseDir, runId, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }
}
