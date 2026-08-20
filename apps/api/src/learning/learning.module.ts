import { Module } from '@nestjs/common';
import { LearningService, PrismaLearningRepository } from '@english/learning';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { LearningController } from './learning.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [LearningController],
  providers: [
    {
      provide: LearningService,
      useFactory: (prisma: PrismaService) =>
        new LearningService(new PrismaLearningRepository(prisma)),
      inject: [PrismaService],
    },
  ],
  exports: [LearningService],
})
export class LearningModule {}
