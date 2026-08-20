import { PrismaClient } from '@prisma/client';
import { IdentityService, PrismaIdentityRepository } from '@english/identity';
async function main(): Promise<void> {
  const [username, password, displayName = 'Owner'] = process.argv.slice(2);
  if (!username || !password || password.length < 8)
    throw new Error('Usage: owner:create <username> <password-min-8> [display-name]');
  const prisma = new PrismaClient();
  try {
    const user = await new IdentityService(new PrismaIdentityRepository(prisma)).createOwner(
      username,
      password,
      displayName,
    );
    console.log(`Created local owner ${user.username}`);
  } finally {
    await prisma.$disconnect();
  }
}
void main();
