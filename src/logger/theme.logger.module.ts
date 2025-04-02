import { Module } from '@nestjs/common';
import { ThemeLogger } from './theme.logger';

@Module({
  providers: [ThemeLogger],
  exports: [ThemeLogger],
})
export class ThemeLoggerModule {}
