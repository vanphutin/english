import { describe, expect, it } from 'vitest';
import { LessonGenerator } from './lesson-generator.js';

describe('LessonGenerator (stub — awaiting CF3 provider-backed implementation)', () => {
  const generator = new LessonGenerator();

  it('throws NOT_IMPLEMENTED for pilot A1 generation until provider is integrated', () => {
    expect(() => generator.generatePilotA1Packages()).toThrow('NOT_IMPLEMENTED');
  });

  it('throws NOT_IMPLEMENTED for bulk generation until provider is integrated', () => {
    expect(() => generator.generateAll235Packages()).toThrow('NOT_IMPLEMENTED');
  });
});
