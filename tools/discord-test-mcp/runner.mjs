import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './inventory.mjs';

const toolRoot = dirname(fileURLToPath(import.meta.url));
export const suites = Object.freeze({
  components: [
    'tests/interactions',
    'tests/commands',
    'tests/utils/command-paths.test.ts',
    'tests/repositories/replay-rating.repository.test.ts',
    'tests/services/replay-rating.service.test.ts',
    'tests/services/service-credentials.test.ts',
    'tests/services/bot-profile.test.ts',
    'tests/services/activity-rank.service.test.ts',
    'tests/repositories/activity-rank.repository.test.ts',
    'tests/services/community-controls.test.ts',
    'tests/services/guild-branding.test.ts',
    'tests/services/shatabrick-factions.test.ts',
  ],
  permissions: [
    'tests/interactions/button-scenarios.test.ts',
    'tests/commands/notification-permissions.test.ts',
    'tests/commands/activity-admin.test.ts',
    'tests/commands/activity-profile.test.ts',
    'tests/commands/profile-controls.test.ts',
    'tests/utils/permissions.test.ts',
  ],
});

export function offlineEnvironment(temporaryDirectory) {
  const env = {};
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'TEMP',
    'TMP',
    'TMPDIR',
    'COMSPEC',
    'PATHEXT',
    'LANG',
    'LC_ALL',
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  if (temporaryDirectory) {
    env.TEMP = temporaryDirectory;
    env.TMP = temporaryDirectory;
    env.TMPDIR = temporaryDirectory;
  }
  return {
    ...env,
    NODE_ENV: 'test',
    NODE_OPTIONS: `--require="${join(toolRoot, 'offline-preload.cjs').replaceAll('\\', '/')}"`,
    DISCORD_TOKEN: 'test-token-0000000000000000',
    DATABASE_PATH: ':memory:',
    OWNER_ID: '123456789012345678',
    LOG_LEVEL: 'error',
    NO_COLOR: '1',
  };
}

let running = false;
function stopOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    execFile(
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true },
      (error) => {
        if (error && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      },
    );
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}
export async function runOfflineTests(suite = 'components', signal) {
  if (!Object.hasOwn(suites, suite)) throw new Error('Unknown test suite.');
  if (running) throw new Error('A test run is already in progress.');
  if (signal?.aborted) throw new Error('Test run cancelled.');
  running = true;
  let directory;
  try {
    const cacheRoot = join(toolRoot, 'node_modules', '.eva-test-cache');
    await mkdir(cacheRoot, { recursive: true });
    const boundary = relative(await realpath(projectRoot), await realpath(cacheRoot));
    if (boundary.startsWith('..') || isAbsolute(boundary))
      throw new Error('Test cache must stay inside the bot workspace.');
    directory = await mkdtemp(join(cacheRoot, 'run-'));
    const report = join(directory, 'report.json');
    const child = spawn(
      process.execPath,
      [
        join(projectRoot, 'node_modules/vitest/vitest.mjs'),
        'run',
        ...suites[suite],
        '--maxWorkers=1',
        '--reporter=json',
        `--outputFile=${report}`,
      ],
      {
        cwd: projectRoot,
        env: offlineEnvironment(directory),
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout.resume();
    child.stderr.resume();
    let timedOut = false;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      stopOwnedChild(child);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => {
      timedOut = true;
      stopOwnedChild(child);
    }, 180_000);
    let code;
    try {
      code = await new Promise((accept, reject) => {
        child.once('error', reject);
        child.once('close', accept);
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    if (timedOut || cancelled)
      throw new Error(timedOut ? 'Test run exceeded 180 seconds.' : 'Test run cancelled.');
    let result;
    try {
      if ((await stat(report)).size > 5_000_000) throw new Error('Report exceeds size limit.');
      result = JSON.parse(await readFile(report, 'utf8'));
    } catch {
      // Do not return process logs: trusted tests can still print private filesystem paths.
      throw new Error(
        `Test runner exited ${code ?? 'without a status'} without a readable report. Check the local test installation.`,
      );
    }
    const failures = (result.testResults ?? [])
      .flatMap((file) => {
        const assertions = (file.assertionResults ?? [])
          .filter((test) => test.status === 'failed')
          .map((test) => ({
            name: test.fullName,
            failure: (test.failureMessages ?? []).join('\n').slice(0, 2000),
          }));
        if (file.status === 'failed' && assertions.length === 0) {
          assertions.push({
            name: file.name,
            failure: String(file.message ?? 'Suite failed to load.').slice(0, 2000),
          });
        }
        return assertions;
      })
      .slice(0, 30);
    return {
      suite,
      success: code === 0 && result.success === true,
      passed: result.numPassedTests,
      failed: result.numFailedTests,
      pending: result.numPendingTests,
      failedSuites: result.numFailedTestSuites,
      total: result.numTotalTests,
      failures,
      isolation: { database: ':memory:', productionEnvLoaded: false, network: 'blocked' },
      scope:
        'Local handler and registry tests, not real Discord button clicks or exhaustive branch coverage.',
    };
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      running = false;
    }
  }
}
