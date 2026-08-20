export interface CurriculumReleaseSpec {
  schemaVersion: '1.0';
  code: string;
  title: string;
  version: number;
  levels: Array<{
    code: string;
    cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    title: string;
    unlockPolicy: Record<string, unknown>;
    units: Array<{
      code: string;
      title: string;
      items: Array<{
        grammarPointCode: string;
        grammarPointVersion: number;
        role: 'REQUIRED' | 'REVIEW' | 'OPTIONAL';
        weight: number;
        minimumEvidenceCount: number;
      }>;
    }>;
  }>;
}
export interface CurriculumView {
  code: string;
  title: string;
  version: number;
  levels: Array<{
    code: string;
    cefr: string;
    title: string;
    units: Array<{
      code: string;
      title: string;
      items: Array<{ grammarPointCode: string; grammarPointVersion: number; role: string }>;
    }>;
  }>;
}
export interface CurriculumRepository {
  importDraft(spec: CurriculumReleaseSpec, hash: string): Promise<void>;
  publish(code: string, version: number): Promise<void>;
  getActive(): Promise<CurriculumView | null>;
}
