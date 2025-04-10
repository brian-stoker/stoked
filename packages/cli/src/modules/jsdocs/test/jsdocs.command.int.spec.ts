import { ThemeLogger } from '../../../logger/theme.logger.js';
import { TestingModule } from '@nestjs/testing';
import { CommandTestFactory } from 'nest-commander-testing';
import { JsdocsModule } from '../jsdocs.module.js';
import { LlmService } from '../../llm/llm.service.js';

describe('JsdocsCommand', () => {
  let commandInstance: TestingModule;
  let logger: ThemeLogger;
  let llmService: LlmService;

  beforeEach(async () => {
    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [JsdocsModule],
    })
      .overrideProvider(ThemeLogger)
      .useValue({ log: jest.fn() })
      .overrideProvider(LlmService)
      .useValue({ query: jest.fn().mockReturnValue('hoge') })
      .compile();

    logger = commandInstance.get<ThemeLogger>(ThemeLogger);
    llmService = commandInstance.get<LlmService>(LlmService);
  });

  it('run method', async () => {
    await CommandTestFactory.run(commandInstance, ['brian-stoker/sst-monorepo-template-pnpm']);
    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(llmService.query).toHaveBeenCalledTimes(1);
  });

  it('isDefault', async () => {
    await CommandTestFactory.run(commandInstance, []);
    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(llmService.query).toHaveBeenCalledTimes(1);
  });
});
