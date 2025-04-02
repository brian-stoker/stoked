import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThemeLoggerModule } from './logger/theme.logger.module';
import { LlmModule } from './services/llm.module';
import { RepoModule } from './services/repo.module';
import { JsDocsModule } from './commands/jsdocs.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ThemeLoggerModule,
    LlmModule,
    RepoModule,
    JsDocsModule,
  ],
})
export class CliModule {}
