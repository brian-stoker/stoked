import { Controller, Get } from '@nestjs/common';
import { CliService } from './cli.service.js';

@Controller()
export class CliController {
  constructor(private readonly cliService: CliService) {}

}
