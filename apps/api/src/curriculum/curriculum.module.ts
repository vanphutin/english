import { Module } from '@nestjs/common';
import { CurriculumService, PrismaCurriculumRepository } from '@english/curriculum';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { CurriculumController } from './curriculum.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CurriculumController],
  providers: [
    {
      provide: CurriculumService,
      useFactory: (prisma: PrismaService) =>
        new CurriculumService(new PrismaCurriculumRepository(prisma)),
      inject: [PrismaService],
    },
  ],
})
export class CurriculumModule {}
