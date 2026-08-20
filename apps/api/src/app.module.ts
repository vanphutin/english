import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { HealthModule } from './health/health.module';
import { GrammarKnowledgeBaseModule } from './grammar-kb/grammar-kb.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { IdentityModule } from './identity/identity.module';
import { SessionAuthGuard } from './identity/session-auth.guard';
import { PracticeModule } from './practice/practice.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { LearningModule } from './learning/learning.module';
import { EngagementModule } from './engagement/engagement.module';

const environmentSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: (values: Record<string, unknown>) => environmentSchema.parse(values),
    }),
    HealthModule,
    GrammarKnowledgeBaseModule,
    CurriculumModule,
    IdentityModule,
    PracticeModule,
    LearningModule,
    EvaluationModule,
    EngagementModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SessionAuthGuard }],
})
export class AppModule {}
