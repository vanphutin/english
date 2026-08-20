import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports the API process as healthy', async () => {
    const module = await Test.createTestingModule({ providers: [HealthService] }).compile();
    const result = module.get(HealthService).getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
