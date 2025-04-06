import { Test, TestingModule } from '@nestjs/testing';
import { CliController } from './cli.controller.js';
import { CliService } from './cli.service.js';

describe('CliController', () => {
  let cliController: CliController;
  let cliService: CliService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [CliController],
      providers: [CliService],
    }).compile();

    cliController = app.get<CliController>(CliController);
    cliService = app.get<CliService>(CliService);
  });

  it('should be defined', () => {
    expect(cliController).toBeDefined();
  });
});
