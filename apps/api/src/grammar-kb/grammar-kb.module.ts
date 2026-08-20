import { Module } from '@nestjs/common';
import {
  GrammarKnowledgeBaseService,
  PrismaGrammarKnowledgeBaseRepository,
} from '@english/grammar-kb';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { GrammarKnowledgeBaseController } from './grammar-kb.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [GrammarKnowledgeBaseController],
  providers: [
    {
      provide: GrammarKnowledgeBaseService,
      useFactory: (prisma: PrismaService) =>
        new GrammarKnowledgeBaseService(new PrismaGrammarKnowledgeBaseRepository(prisma)),
      inject: [PrismaService],
    },
  ],
  exports: [GrammarKnowledgeBaseService],
})
export class GrammarKnowledgeBaseModule {}
