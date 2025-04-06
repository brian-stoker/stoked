import { Global, Module } from '@nestjs/common';
import {ThemeLogger} from "./theme.logger.js";

@Global()
@Module({
  providers: [ThemeLogger],
  exports: [ThemeLogger],
})
export class ThemeLoggerModule {}
