import { Module } from '@nestjs/common';
import {
  EngagementService,
  PrismaEngagementRepository,
  PrismaStoryRepository,
  StoryService,
  GrowthService,
  PrismaGrowthRepository,
  ConsistencyService,
  PrismaConsistencyRepository,
} from '@english/engagement';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { PracticeModule } from '../practice/practice.module';
import { EngagementController } from './engagement.controller';
import { UnitChallengesController } from './unit-challenges.controller';
import { StoryController } from './story.controller';
import { GrowthController } from './growth.controller';
import { ConsistencyController } from './consistency.controller';

@Module({
  imports: [DatabaseModule, PracticeModule],
  controllers: [
    EngagementController,
    UnitChallengesController,
    StoryController,
    GrowthController,
    ConsistencyController,
  ],
  providers: [
    {
      provide: EngagementService,
      useFactory: (prisma: PrismaService) =>
        new EngagementService(new PrismaEngagementRepository(prisma)),
      inject: [PrismaService],
    },
    {
      provide: StoryService,
      useFactory: (prisma: PrismaService) => new StoryService(new PrismaStoryRepository(prisma)),
      inject: [PrismaService],
    },
    {
      provide: GrowthService,
      useFactory: (prisma: PrismaService) => new GrowthService(new PrismaGrowthRepository(prisma)),
      inject: [PrismaService],
    },
    {
      provide: ConsistencyService,
      useFactory: (prisma: PrismaService) =>
        new ConsistencyService(new PrismaConsistencyRepository(prisma)),
      inject: [PrismaService],
    },
  ],
})
export class EngagementModule {}
