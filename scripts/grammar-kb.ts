import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import {
  GrammarKnowledgeBaseService,
  PrismaGrammarKnowledgeBaseRepository,
} from '@english/grammar-kb';

async function main(): Promise<void> {
  const [command, argument, versionText] = process.argv.slice(2);
  const prisma = new PrismaClient();
  const service = new GrammarKnowledgeBaseService(new PrismaGrammarKnowledgeBaseRepository(prisma));

  try {
    if (command === 'import' && argument) {
      await service.importDraft(JSON.parse(await readFile(argument, 'utf8')) as unknown);
      console.log(`Imported draft from ${argument}`);
    } else if (command === 'publish' && argument && versionText) {
      console.log(await service.publish(argument, Number(versionText)));
    } else {
      throw new Error('Usage: grammar-kb import <file.json> | publish <CODE> <version>');
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
