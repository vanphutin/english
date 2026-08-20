import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { CurriculumService, PrismaCurriculumRepository } from '@english/curriculum';

async function main(): Promise<void> {
  const [command, argument, versionText] = process.argv.slice(2);
  const prisma = new PrismaClient();
  const service = new CurriculumService(new PrismaCurriculumRepository(prisma));
  try {
    if (command === 'import' && argument) {
      await service.importDraft(JSON.parse(await readFile(argument, 'utf8')) as unknown);
      console.log(`Imported curriculum draft from ${argument}`);
    } else if (command === 'publish' && argument && versionText) {
      await service.publish(argument, Number(versionText));
      console.log(`Published curriculum ${argument} v${versionText}`);
    } else throw new Error('Usage: curriculum import <file.json> | publish <CODE> <version>');
  } finally {
    await prisma.$disconnect();
  }
}
void main();
