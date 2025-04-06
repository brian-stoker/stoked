/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  injectGlobals: true,
  setupFilesAfterEnv: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!@octokit|ollama|node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill)',
  ],
  moduleDirectories: ['node_modules', '<rootDir>'],
  verbose: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.workspace/'
  ],
};
