import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listGroupedTestFiles,
  parseTestGroup,
  runVitestFiles,
} from '@/testing/groupedVitestRunner.js';

function makeWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'grouped-vitest-runner-'));
}

function writeFile(workspaceRoot: string, relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, '// test file\n', 'utf8');
}

describe('groupedVitestRunner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters files to the requested test group', () => {
    const workspaceRoot = makeWorkspace();
    writeFile(workspaceRoot, 'tests/unit/alpha.test.ts');
    writeFile(workspaceRoot, 'tests/integration/beta.test.ts');
    writeFile(workspaceRoot, 'tests/db/gamma.test.ts');

    expect(listGroupedTestFiles(workspaceRoot, 'integration')).toEqual([
      path.join('tests', 'integration', 'beta.test.ts'),
    ]);
  });

  it('returns discovered files in sorted order', () => {
    const workspaceRoot = makeWorkspace();
    writeFile(workspaceRoot, 'tests/unit/zulu.test.ts');
    writeFile(workspaceRoot, 'tests/unit/alpha.test.ts');
    writeFile(workspaceRoot, 'tests/unit/nested/bravo.test.ts');

    expect(listGroupedTestFiles(workspaceRoot, 'unit')).toEqual([
      path.join('tests', 'unit', 'alpha.test.ts'),
      path.join('tests', 'unit', 'nested', 'bravo.test.ts'),
      path.join('tests', 'unit', 'zulu.test.ts'),
    ]);
  });

  it('fails clearly when a requested test group is empty', () => {
    const workspaceRoot = makeWorkspace();
    mkdirSync(path.join(workspaceRoot, 'tests', 'db'), { recursive: true });

    expect(() => listGroupedTestFiles(workspaceRoot, 'db')).toThrow(
      /No test files matched the db group/
    );
  });

  it('rejects unsupported group names', () => {
    expect(() => parseTestGroup('e2e')).toThrow(/Unsupported grouped test target/);
  });

  it('propagates child process failure exit codes', async () => {
    const exitCallbacks: Array<(code: number) => void> = [];
    const errorCallbacks: Array<(error: Error) => void> = [];
    const spawnImpl = vi.fn((_command, _args, _options) => {
      const emitter = new EventEmitter();
      return {
        once(event: 'error' | 'exit', callback: (...args: unknown[]) => void) {
          if (event === 'exit') {
            exitCallbacks.push(callback as (code: number) => void);
          } else {
            errorCallbacks.push(callback as (error: Error) => void);
          }

          return emitter;
        },
      };
    });

    const runPromise = runVitestFiles(
      '/tmp/workspace-root',
      ['tests/unit/example.test.ts'],
      spawnImpl
    );

    expect(errorCallbacks).toHaveLength(1);
    expect(exitCallbacks).toHaveLength(1);

    exitCallbacks[0](7);

    await expect(runPromise).resolves.toBe(7);
  });
});
