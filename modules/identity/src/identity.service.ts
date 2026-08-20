import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { AuthenticatedUser, IdentityRepository, LocalSession } from './types.js';

export class IdentityService {
  constructor(private readonly repository: IdentityRepository) {}
  async createOwner(
    username: string,
    password: string,
    displayName: string,
  ): Promise<AuthenticatedUser> {
    return this.repository.createUser(
      normalizeUsername(username),
      await argon2.hash(password, { type: argon2.argon2id }),
      displayName.trim(),
    );
  }
  /** Returns the same failure for unknown users and bad passwords to avoid account enumeration. */
  async login(username: string, password: string, now = new Date()): Promise<LocalSession | null> {
    const credentials = await this.repository.findCredentials(normalizeUsername(username));
    if (!credentials || !(await argon2.verify(credentials.passwordHash, password))) return null;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await this.repository.createSession(credentials.user.id, hashToken(token), expiresAt);
    return { token, expiresAt, user: credentials.user };
  }
  async authenticate(
    token: string | undefined,
    now = new Date(),
  ): Promise<AuthenticatedUser | null> {
    return token ? this.repository.findSession(hashToken(token), now) : null;
  }
  async logout(token: string | undefined): Promise<void> {
    if (token) await this.repository.deleteSession(hashToken(token));
  }
}
function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
