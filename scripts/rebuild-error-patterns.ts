import { PrismaClient } from '@prisma/client';
import { EngagementService, PrismaEngagementRepository } from '@english/engagement';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({ select: { id: true, username: true } });
    const service = new EngagementService(new PrismaEngagementRepository(prisma));
    let totalPatterns = 0;

    for (const user of users) {
      const notebook = await service.getErrorNotebook(user.id);
      totalPatterns += notebook.patterns.length;
      console.log(`${user.username}: ${notebook.patterns.length} error pattern(s)`);
    }

    console.log(`Rebuilt ${totalPatterns} error pattern(s) for ${users.length} user(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
