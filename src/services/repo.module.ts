import { Module } from '@nestjs/common';
import { RepoService } from './repo.service';
import { ThemeLoggerModule } from '../logger/theme.logger.module';

@Module({
  imports: [ThemeLoggerModule],
  providers: [RepoService],
  exports: [RepoService],
})
export class RepoModule {} 