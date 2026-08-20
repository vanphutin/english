import { describe, expect, it, vi } from 'vitest';
import { IdentityService } from './identity.service.js';
import type { IdentityRepository } from './types.js';
const createUser = vi.fn<IdentityRepository['createUser']>();
const findCredentials = vi.fn<IdentityRepository['findCredentials']>();
const createSession = vi.fn<IdentityRepository['createSession']>();
const findSession = vi.fn<IdentityRepository['findSession']>();
const deleteSession = vi.fn<IdentityRepository['deleteSession']>();
const repo: IdentityRepository = {
  createUser,
  findCredentials,
  createSession,
  findSession,
  deleteSession,
};
describe('IdentityService', () => {
  it('rejects invalid credentials without creating a session', async () => {
    findCredentials.mockResolvedValue(null);
    await expect(new IdentityService(repo).login('owner', 'wrong')).resolves.toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });
  it('returns null for a missing cookie', async () => {
    await expect(new IdentityService(repo).authenticate(undefined)).resolves.toBeNull();
  });
  it('makes logout idempotent without a cookie', async () => {
    await expect(new IdentityService(repo).logout(undefined)).resolves.toBeUndefined();
  });
});
