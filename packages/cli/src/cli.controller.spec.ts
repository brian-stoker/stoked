import { Test, TestingModule } from '@nestjs/testing';
import { CliController } from './cli.controller.js';
import { CliService } from './cli.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CliController', () => {
  let cliController: CliController;
  let cliService: CliService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [CliController],
      providers: [
        {
          provide: CliService,
          useValue: {
            getHello: vi.fn().mockReturnValue('Hello World!'),
          },
        },
      ],
    }).compile();

    cliController = app.get<CliController>(CliController);
    cliService = app.get<CliService>(CliService);
  });

  describe('getHello', () => {
    it('should return "Hello World!"', () => {
      expect(cliController.getHello()).toBe('Hello World!');
      expect(cliService.getHello).toHaveBeenCalled();
    });
  });
});
