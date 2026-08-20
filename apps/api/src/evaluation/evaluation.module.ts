import { Module } from '@nestjs/common';
import { EvaluationService, PrismaEvaluationRepository } from '@english/evaluation';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { EvaluationController } from './evaluation.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [EvaluationController],
  providers: [
    {
      provide: EvaluationService,
      useFactory: (prisma: PrismaService) =>
        new EvaluationService(new PrismaEvaluationRepository(prisma)),
      inject: [PrismaService],
    },
  ],
})
export class EvaluationModule {}
