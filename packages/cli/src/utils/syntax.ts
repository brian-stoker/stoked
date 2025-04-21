// validate-diff.ts
import { parse } from '@babel/parser';

type SyntaxCheckResult = {
  valid: boolean;
  error?: string;
};

export function checkSyntax(code: string, filename = 'input.ts'): SyntaxCheckResult {
  try {
    parse(code, {
      sourceFilename: filename,
      sourceType: 'unambiguous',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'dynamicImport',
        'importMeta',
        'topLevelAwait',
      ],
    });
    return { valid: true };
  } catch (e: any) {
    return {
      valid: false,
      error: e.message,
    };
  }
}

export function compareSyntax(before: string, after: string): {
  before: SyntaxCheckResult;
  after: SyntaxCheckResult;
  changed: boolean;
} {
  const resultBefore = checkSyntax(before, 'before.ts');
  const resultAfter = checkSyntax(after, 'after.ts');

  const changed =
    resultBefore.valid !== resultAfter.valid ||
    resultBefore.error !== resultAfter.error;

  return {
    before: resultBefore,
    after: resultAfter,
    changed,
  };
}