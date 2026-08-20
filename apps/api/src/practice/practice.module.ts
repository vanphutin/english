import { Module } from '@nestjs/common';
import { PracticeService, PrismaPracticeRepository } from '@english/practice';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { PracticeController } from './practice.controller';
import { HintController } from './hint.controller';
import { DailyChoicesController } from './daily-choices.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [PracticeController, HintController, DailyChoicesController],
  providers: [
    {
      provide: PracticeService,
      useFactory: (prisma: PrismaService) =>
        new PracticeService(new PrismaPracticeRepository(prisma)),
      inject: [PrismaService],
    },
  ],
  exports: [PracticeService],
})
export class PracticeModule {}
