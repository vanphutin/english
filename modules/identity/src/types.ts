export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
}
export interface LocalSession {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}
export interface IdentityRepository {
  createUser(
    username: string,
    passwordHash: string,
    displayName: string,
  ): Promise<AuthenticatedUser>;
  findCredentials(
    username: string,
  ): Promise<{ user: AuthenticatedUser; passwordHash: string } | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<AuthenticatedUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
}
