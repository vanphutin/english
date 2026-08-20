import { Global, Module } from '@nestjs/common';
import { IdentityService, PrismaIdentityRepository } from '@english/identity';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { IdentityController } from './identity.controller';
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [
    {
      provide: IdentityService,
      useFactory: (prisma: PrismaService) =>
        new IdentityService(new PrismaIdentityRepository(prisma)),
      inject: [PrismaService],
    },
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
