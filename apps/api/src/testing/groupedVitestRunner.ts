import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const TEST_GROUPS = ['unit', 'integration', 'db'] as const;

export type TestGroup = (typeof TEST_GROUPS)[number];

export interface SpawnLike {
  (
    command: string,
    args: readonly string[],
    options: {
      cwd: string;
      stdio: 'inherit';
      env: NodeJS.ProcessEnv;
    }
  ): Pick<ChildProcess, 'once'>;
}

function isSupportedTestFile(filename: string) {
  return /\.(test)\.(cts|mts|ts|tsx|js|jsx|mjs|cjs)$/.test(filename);
}

function walkDirectory(rootDir: string, currentDir = rootDir): string[] {
  const entries = readdirSync(currentDir, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkDirectory(rootDir, entryPath));
      continue;
    }

    if (!entry.isFile() || !isSupportedTestFile(entry.name)) {
      continue;
    }

    files.push(path.relative(rootDir, entryPath));
  }

  return files;
}

export function isTestGroup(value: string): value is TestGroup {
  return TEST_GROUPS.includes(value as TestGroup);
}

export function parseTestGroup(value: string | undefined): TestGroup {
  if (!value) {
    throw new Error(
      `A grouped test target is required (${TEST_GROUPS.join(', ')}).`
    );
  }

  if (!isTestGroup(value)) {
    throw new Error(
      `Unsupported grouped test target "${value}". Use one of: ${TEST_GROUPS.join(', ')}.`
    );
  }

  return value;
}

export function getApiWorkspaceRoot(
  moduleUrl = import.meta.url
): string {
  return fileURLToPath(new URL('../../', moduleUrl));
}

export function listGroupedTestFiles(
  workspaceRoot: string,
  group: TestGroup
): string[] {
  const groupRoot = path.join(workspaceRoot, 'tests', group);
  const files = walkDirectory(workspaceRoot, groupRoot).sort((left, right) =>
    left.localeCompare(right)
  );

  if (files.length === 0) {
    throw new Error(
      `No test files matched the ${group} group under ${path.relative(
        workspaceRoot,
        groupRoot
      )}.`
    );
  }

  return files;
}

export function resolveVitestEntrypoint(workspaceRoot: string): string {
  const candidates = [
    path.join(workspaceRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(workspaceRoot, '..', 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(workspaceRoot, '..', '..', 'node_modules', 'vitest', 'vitest.mjs'),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));

  if (resolved) {
    return resolved;
  }

  const require = createRequire(import.meta.url);
  return require.resolve('vitest');
}

export function runVitestFiles(
  workspaceRoot: string,
  files: readonly string[],
  spawnImpl: SpawnLike = spawn
): Promise<number> {
  if (files.length === 0) {
    return Promise.reject(
      new Error('runVitestFiles requires at least one discovered test file.')
    );
  }

  const vitestEntrypoint = resolveVitestEntrypoint(workspaceRoot);

  return new Promise((resolve, reject) => {
    const child = spawnImpl(
      process.execPath,
      [vitestEntrypoint, 'run', ...files],
      {
        cwd: workspaceRoot,
        stdio: 'inherit',
        env: process.env,
      }
    );

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (typeof code === 'number') {
        resolve(code);
        return;
      }

      reject(
        new Error(
          `Vitest exited without a numeric code${signal ? ` (signal: ${signal})` : ''}.`
        )
      );
    });
  });
}

export async function runGroupedVitest(
  groupArg: string | undefined,
  workspaceRoot = getApiWorkspaceRoot(),
  spawnImpl: SpawnLike = spawn
): Promise<number> {
  const group = parseTestGroup(groupArg);
  const files = listGroupedTestFiles(workspaceRoot, group);

  return runVitestFiles(workspaceRoot, files, spawnImpl);
}

async function main() {
  try {
    const exitCode = await runGroupedVitest(process.argv[2]);
    process.exit(exitCode);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Grouped Vitest runner failed.';
    console.error(message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
