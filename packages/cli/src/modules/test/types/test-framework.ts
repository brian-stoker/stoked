/**
 * Repository type enumeration
 */
export enum RepoType {
  FRONTEND_WEB = 'frontend-web',
  FRONTEND_MOBILE = 'frontend-mobile',
  FRONTEND_LIB = 'frontend-lib',
  BACKEND_API = 'backend-api',
  BACKEND_LIB = 'backend-lib',
  GENERAL_LIB = 'general-lib',
  UNKNOWN = 'unknown',
}

/**
 * Repository analysis result
 */
export interface RepoAnalysis {
  /** The detected repository type */
  type: RepoType;
  /** Whether the repository is a monorepo */
  isMonorepo: boolean;
  /** List of packages if it's a monorepo */
  packages?: string[];
  /** Main tech stack (React, Vue, NestJS, etc.) */
  techStack?: string[];
  /** Project structure metadata */
  structure?: {
    /** Root directories with source code */
    srcDirs: string[];
    /** Root directories with tests */
    testDirs: string[];
    /** Pattern for test files */
    testPattern?: string;
  };
}

/**
 * Test framework types
 */
export enum TestFrameworkType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  COMPONENT = 'component',
  SNAPSHOT = 'snapshot',
  A11Y = 'a11y',
}

/**
 * Detected test frameworks
 */
export interface TestFrameworks {
  /** Unit testing framework (Jest, Mocha, etc.) */
  [TestFrameworkType.UNIT]?: string;
  /** Integration testing framework (Supertest, etc.) */
  [TestFrameworkType.INTEGRATION]?: string;
  /** End-to-end testing framework (Cypress, Playwright, etc.) */
  [TestFrameworkType.E2E]?: string;
  /** Component testing library (React Testing Library, etc.) */
  [TestFrameworkType.COMPONENT]?: string;
  /** Snapshot testing */
  [TestFrameworkType.SNAPSHOT]?: string;
  /** Accessibility testing */
  [TestFrameworkType.A11Y]?: string;
}

/**
 * Test coverage information
 */
export interface CoverageInfo {
  /** Overall coverage percentage */
  overall: number;
  /** Coverage by type */
  byType: {
    /** Line coverage percentage */
    lines?: number;
    /** Statement coverage percentage */
    statements?: number;
    /** Function coverage percentage */
    functions?: number;
    /** Branch coverage percentage */
    branches?: number;
  };
  /** Files with low coverage */
  lowCoverageFiles?: Array<{
    /** File path */
    path: string;
    /** Coverage percentage */
    coverage: number;
  }>;
}

/**
 * Test configuration by repository type
 */
export interface TestConfig {
  /** Repository type */
  repoType: RepoType;
  /** Target coverage percentage */
  targetCoverage: number;
  /** Test frameworks to use */
  frameworks: TestFrameworks;
  /** Test types to generate */
  testTypes: TestFrameworkType[];
} 