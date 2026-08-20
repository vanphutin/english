import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser, IdentityRepository } from './types.js';

export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async createUser(
    username: string,
    passwordHash: string,
    displayName: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.create({
      data: { username, passwordHash, profile: { create: { displayName } } },
      select: { id: true, username: true, profile: { select: { displayName: true } } },
    });
    return {
      id: user.id,
      username: user.username,
      displayName: user.profile?.displayName ?? displayName,
    };
  }
  async findCredentials(username: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        profile: { select: { displayName: true } },
      },
    });
    return user && user.profile
      ? {
          user: { id: user.id, username: user.username, displayName: user.profile.displayName },
          passwordHash: user.passwordHash,
        }
      : null;
  }
  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.authSession.create({ data: { userId, tokenHash, expiresAt } });
  }
  async findSession(tokenHash: string, now: Date): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.authSession.findFirst({
      where: { tokenHash, expiresAt: { gt: now }, user: { status: 'ACTIVE', deletedAt: null } },
      select: {
        user: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
    });
    return session?.user.profile
      ? {
          id: session.user.id,
          username: session.user.username,
          displayName: session.user.profile.displayName,
        }
      : null;
  }
  async deleteSession(tokenHash: string): Promise<void> {
    await this.prisma.authSession.deleteMany({ where: { tokenHash } });
  }
}
