import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const {
  compatibleVersion,
  compatibleCandidate,
  assertCompatible,
  assertFiles,
  overridePlan,
  advisoryFixes,
  canAutoMerge,
  publish,
  updateProject,
  shouldRequestReview,
} = require('../../scripts/security-maintenance.js');
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const manifest = () => ({
  name: 'test',
  version: '1.0.0',
  scripts: { test: 'node test.js' },
  dependencies: { demo: '1.0.0' },
});
const lock = (version = '1.0.0') => ({ packages: { 'node_modules/demo': { version } } });

describe('compatible security update boundaries', () => {
  it('requests review only for a new tested commit or a transition to passing', () => {
    const sha = 'a'.repeat(40);
    const body = `Status: **Ready for your review**\nTested commit: \`${sha}\`\nold run link`;
    expect(shouldRequestReview(body, sha, true)).toBe(false);
    expect(shouldRequestReview(body, 'b'.repeat(40), true)).toBe(true);
    expect(shouldRequestReview('Needs attention', sha, true)).toBe(true);
    expect(shouldRequestReview(undefined, sha, true)).toBe(true);
    expect(shouldRequestReview(body, sha, false)).toBe(false);
  });
  it('selects a patched older release line even when the latest major is newer', () => {
    expect(compatibleCandidate('^4.1.11', '4.1.11', ['5.0.5', '4.1.12', '4.1.11'])).toBe('4.1.12');
    expect(compatibleCandidate('~4.1.11', '4.1.11', ['4.2.0', '4.1.12'])).toBe('4.1.12');
    expect(compatibleCandidate('4.1.11', '4.1.11', ['5.0.5', '4.2.0', '4.1.12'])).toBe('4.1.12');
    expect(compatibleCandidate('^4.1.11', '4.1.11', ['5.0.5'])).toBeUndefined();
  });
  it.each([
    ['1.2.3', '1.2.4', true],
    ['1.2.3', '1.3.0', true],
    ['1.2.3', '2.0.0', false],
    ['0.2.3', '0.2.4', true],
    ['0.2.3', '0.3.0', false],
    ['0.0.1', '0.0.2', false],
    ['1.2.3', '1.2.2', false],
    ['1.2.3', '1.1.9', false],
    ['1.0.0', '2.0.0-beta.1', false],
  ])('checks %s -> %s', (before, after, compatible) =>
    expect(compatibleVersion(before, after)).toBe(compatible),
  );
  it('refuses major direct changes, manifest scripts and unrelated files', () => {
    expect(() => assertCompatible(manifest(), manifest(), lock(), lock('2.0.0'))).toThrow(
      'Incompatible locked',
    );
    expect(() =>
      assertCompatible(
        manifest(),
        { ...manifest(), scripts: { postinstall: 'bad' } },
        lock(),
        lock(),
      ),
    ).toThrow('non-dependency');
    expect(() => assertFiles(['package-lock.json', '.github/workflows/ci.yml'])).toThrow('only');
    expect(() => assertFiles(['.env'])).toThrow('only');
    expect(() =>
      assertFiles(['package-lock.json', 'tools/discord-test-mcp/package.json']),
    ).not.toThrow();
  });
  it('allows compatible parents to update their internal dependencies for matrix testing', () => {
    const oldLock = {
      packages: { ...lock().packages, 'node_modules/internal-compiler': { version: '0.1.0' } },
    };
    const newLock = {
      packages: {
        ...lock('1.0.1').packages,
        'node_modules/internal-compiler': { version: '0.2.0' },
      },
    };
    expect(() => assertCompatible(manifest(), manifest(), oldLock, newLock)).not.toThrow();
  });
  it('allows a compatible exact pin but rejects range broadening and new dependencies', () => {
    expect(() =>
      assertCompatible(
        manifest(),
        { ...manifest(), dependencies: { demo: '1.0.1' } },
        lock(),
        lock('1.0.1'),
      ),
    ).not.toThrow();
    expect(() =>
      assertCompatible(
        manifest(),
        { ...manifest(), dependencies: { demo: '^1.0.0' } },
        lock(),
        lock(),
      ),
    ).toThrow('Incompatible direct');
    expect(() =>
      assertCompatible(
        manifest(),
        { ...manifest(), dependencies: { demo: '1.0.0', extra: '1.0.0' } },
        lock(),
        lock(),
      ),
    ).toThrow('added or removed');
  });
});

describe('security update preparation', () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-security-update-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest()));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock()));
    return root;
  }
  const audit = (fix: unknown = null) =>
    JSON.stringify({
      metadata: { vulnerabilities: { total: fix ? 1 : 0 } },
      vulnerabilities: fix ? { demo: { fixAvailable: fix } } : {},
    });
  it('avoids npm changes when the audit is clean', () => {
    const npm = vi.fn(() => audit());
    const result = updateProject(fixture(), '.', npm);
    expect(result.after.total).toBe(0);
    expect(npm.mock.calls.every((call) => call[0][0] === 'audit' && call[0][1] === '--json')).toBe(
      true,
    );
  });
  it('handles exact compatible pins with scripts disabled and without forced upgrades', () => {
    const root = fixture();
    let patched = false;
    const npm = vi.fn((args: string[]) => {
      if (args[0] === 'view') return JSON.stringify(['1.0.1']);
      if (args[0] === 'install') {
        patched = true;
        fs.writeFileSync(
          path.join(root, 'package.json'),
          JSON.stringify({ ...manifest(), dependencies: { demo: '1.0.1' } }),
        );
        fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock('1.0.1')));
        return '';
      }
      return audit(patched ? null : { name: 'demo', version: '1.0.1', isSemVerMajor: false });
    });
    const result = updateProject(root, '.', npm);
    expect(result.before.total).toBe(1);
    expect(result.after.total).toBe(0);
    for (const [args] of npm.mock.calls.filter(
      ([args]) => args[1] === 'fix' || args[0] === 'install',
    )) {
      expect(args).toContain('--ignore-scripts');
      expect(args).toContain('--package-lock-only');
      expect(args).not.toContain('--force');
    }
  });
  it('keeps major fixes pending for human review', () => {
    const npm = vi.fn((args: string[]) =>
      args[0] === 'view'
        ? JSON.stringify(['2.0.0'])
        : audit({ name: 'demo', version: '2.0.0', isSemVerMajor: true }),
    );
    const result = updateProject(fixture(), '.', npm);
    expect(result.after.total).toBe(1);
    expect(npm.mock.calls.some((call) => call[0][0] === 'install')).toBe(false);
  });
  it('treats an unavailable advisory service as an error, not a clean audit', () => {
    expect(() =>
      updateProject(fixture(), '.', () => JSON.stringify({ error: { code: 'network' } })),
    ).toThrow('could not complete');
  });
  it('adds a scoped override when parents block the only patched release', () => {
    const root = fixture();
    const base = {
      packages: { ...lock().packages, 'node_modules/minimatch': { version: '10.2.6' } },
    };
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(base));
    let relocked = false;
    const npm = vi.fn((args: string[]) => {
      if (args[0] === 'install') {
        relocked = true;
        return '';
      }
      return relocked
        ? audit()
        : JSON.stringify({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: report });
    });
    const lookup = vi.fn(() => [{ name: 'minimatch', patched: '11.0.1' }]);
    const result = updateProject(root, '.', npm, lookup);
    const written = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(written.overrides).toEqual({ 'minimatch@^10': '^11.0.1' });
    expect(result.overrides).toEqual([
      { key: 'minimatch@^10', name: 'minimatch', from: '10.2.6', to: '^11.0.1', major: true },
    ]);
    expect(result.after.total).toBe(0);
    const install = npm.mock.calls.find(([args]) => args[0] === 'install')![0];
    expect(install).toEqual(expect.arrayContaining(['--ignore-scripts', '--package-lock-only']));
    expect(install).not.toContain('--force');
  });
});

// Shape taken from a real `npm audit --json` report for GHSA-g3hv-75wg-m249.
const report = {
  '@typescript-eslint/parser': {
    isDirect: true,
    nodes: ['node_modules/@typescript-eslint/parser'],
    via: ['@typescript-eslint/typescript-estree'],
    fixAvailable: { name: '@typescript-eslint/parser', version: '6.15.0', isSemVerMajor: true },
  },
  minimatch: {
    isDirect: false,
    nodes: ['node_modules/minimatch'],
    via: [
      {
        name: 'minimatch',
        url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
        range: '>=7.0.0 <11.0.1',
      },
    ],
    fixAvailable: { name: '@typescript-eslint/parser', version: '6.15.0', isSemVerMajor: true },
  },
};
const lockWith = (version: string) => ({
  packages: { 'node_modules/minimatch': { version } },
});

describe('transitive override planning', () => {
  it('plans the lowest patched release for the installed line and skips direct packages', () => {
    const lookup = vi.fn(() => [
      { name: 'minimatch', patched: '11.0.1' },
      { name: 'other', patched: '99.0.0' },
    ]);
    expect(overridePlan({ vulnerabilities: report }, {}, lockWith('10.2.6'), lookup)).toEqual([
      { key: 'minimatch@^10', name: 'minimatch', from: '10.2.6', to: '^11.0.1', major: true },
    ]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('GHSA-g3hv-75wg-m249');
  });
  it('clears every advisory and picks the matching line of multi-line advisories', () => {
    const twoAdvisories = {
      minimatch: {
        ...report.minimatch,
        via: [
          report.minimatch.via[0],
          { name: 'minimatch', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' },
        ],
      },
    };
    const lookup = (id: string) =>
      id === 'GHSA-g3hv-75wg-m249'
        ? [{ name: 'minimatch', range: '>= 7.0.0, < 11.0.1', patched: '11.0.1' }]
        : [
            { name: 'minimatch', range: '< 3.1.3', patched: '3.1.3' },
            { name: 'minimatch', range: '>= 10.0.0, < 10.2.9', patched: '10.2.9' },
            { name: 'minimatch', range: '>= 11.0.0, < 11.0.4', patched: '11.0.4' },
          ];
    // 10.2.9 is still hit by the first advisory and 11.0.1 by the second.
    expect(
      overridePlan({ vulnerabilities: twoAdvisories }, {}, lockWith('10.2.6'), lookup)[0].to,
    ).toBe('^11.0.4');
  });
  it('stays on the installed major when that line has a fix', () => {
    const lookup = () => [
      { name: 'minimatch', range: '>= 10.0.0, < 10.2.9', patched: '10.2.9' },
      { name: 'minimatch', range: '>= 11.0.0, < 11.0.4', patched: '11.0.4' },
    ];
    expect(overridePlan({ vulnerabilities: report }, {}, lockWith('10.2.6'), lookup)).toEqual([
      { key: 'minimatch@^10', name: 'minimatch', from: '10.2.6', to: '^10.2.9', major: false },
    ]);
  });
  it('never picks a fix when a line is unpatched or a range is unreadable', () => {
    const unpatched = () => [
      { name: 'minimatch', range: '>= 7.0.0', patched: null },
      { name: 'minimatch', range: '< 7.0.0', patched: '6.9.9' },
    ];
    expect(overridePlan({ vulnerabilities: report }, {}, lockWith('10.2.6'), unpatched)).toEqual(
      [],
    );
    const odd = () => [{ name: 'minimatch', range: '~11.0.0 || ^12', patched: '11.0.1' }];
    expect(overridePlan({ vulnerabilities: report }, {}, lockWith('10.2.6'), odd)).toEqual([]);
  });
  it('raises the override that already controls a copy instead of adding a dead rule', () => {
    const manifest = { overrides: { 'minimatch@^10': '^11.0.1' } };
    const lookup = () => [{ name: 'minimatch', patched: '11.0.7' }];
    expect(overridePlan({ vulnerabilities: report }, manifest, lockWith('11.0.5'), lookup)).toEqual(
      [{ key: 'minimatch@^10', name: 'minimatch', from: '11.0.5', to: '^11.0.7', major: false }],
    );
  });
  it('plans nothing without a patched release, a GitHub advisory link or a safe name', () => {
    expect(overridePlan({ vulnerabilities: report }, {}, lockWith('10.2.6'), () => [])).toEqual([]);
    const noLink = {
      minimatch: {
        ...report.minimatch,
        via: [{ name: 'minimatch', url: 'https://evil.example/x' }],
      },
    };
    expect(overridePlan({ vulnerabilities: noLink }, {}, lockWith('10.2.6'), () => [])).toEqual([]);
    const plain = { overrides: { minimatch: '^9.0.0' } };
    const lookup = vi.fn(() => [{ name: 'minimatch', patched: '11.0.1' }]);
    expect(overridePlan({ vulnerabilities: report }, plain, lockWith('10.2.6'), lookup)).toEqual(
      [],
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it('reads npm ranges and first patched versions from the GitHub advisory API', () => {
    const gh = vi.fn(() =>
      JSON.stringify({
        vulnerabilities: [
          {
            package: { ecosystem: 'npm', name: 'minimatch' },
            vulnerable_version_range: '>= 7.0.0, < 11.0.1',
            first_patched_version: '11.0.1',
          },
          { package: { ecosystem: 'pip', name: 'minimatch' }, first_patched_version: '1.0.0' },
          {
            package: { ecosystem: 'npm', name: 'minimatch' },
            vulnerable_version_range: '< 3.0.0',
            first_patched_version: null,
          },
        ],
      }),
    );
    expect(advisoryFixes('GHSA-g3hv-75wg-m249', gh)).toEqual([
      { name: 'minimatch', range: '>= 7.0.0, < 11.0.1', patched: '11.0.1' },
      { name: 'minimatch', range: '< 3.0.0', patched: null },
    ]);
    expect(gh).toHaveBeenCalledWith(['api', 'advisories/GHSA-g3hv-75wg-m249']);
  });
  it('accepts only added or raised, line-scoped registry overrides', () => {
    const withOverrides = (overrides: Record<string, unknown>) => ({ ...manifest(), overrides });
    const ok = (before: Record<string, unknown>, after: Record<string, unknown>) =>
      assertCompatible(withOverrides(before), withOverrides(after), lock(), lock());
    const existing = { 'brace-expansion@^2': '^2.1.7', 'ip-address': '^10.7.1' };
    expect(() => ok(existing, { ...existing, 'minimatch@^10': '^11.0.1' })).not.toThrow();
    expect(() => ok({ 'minimatch@^10': '^11.0.1' }, { 'minimatch@^10': '^11.0.7' })).not.toThrow();
    expect(() => ok(existing, { 'ip-address': '^10.7.1' })).toThrow('removed');
    expect(() => ok({ 'minimatch@^10': '^11.0.7' }, { 'minimatch@^10': '^11.0.1' })).toThrow(
      'not raised',
    );
    expect(() => ok({}, { minimatch: '^11.0.1' })).toThrow('Unexpected');
    expect(() => ok({}, { 'minimatch@^10': 'github:attacker/minimatch' })).toThrow('Unexpected');
    expect(() => ok({}, { 'minimatch@^10': '^11.0.1 || file:../x' })).toThrow('Unexpected');
    expect(() => ok({}, { 'minimatch@*': '^11.0.1' })).toThrow('Unexpected');
  });
});

describe('automatic merge of tested security updates', () => {
  const sha = 'a'.repeat(40);
  const main = 'b'.repeat(40);
  const repo = 'ArcyFlame/RA3-EVA-Bot';
  it('merges only a passed commit that sits directly on the current default branch', () => {
    expect(canAutoMerge(true, true, main, [main])).toBe(true);
    expect(canAutoMerge(false, true, main, [main])).toBe(false);
    expect(canAutoMerge(true, false, main, [main])).toBe(false);
    expect(canAutoMerge(true, true, main, ['c'.repeat(40)])).toBe(false);
    expect(canAutoMerge(true, true, main, [main, 'c'.repeat(40)])).toBe(false);
    expect(canAutoMerge(true, true, undefined, [undefined])).toBe(false);
    expect(canAutoMerge('true', true, main, [main])).toBe(false);
  });

  function run(options: { result?: string; parent?: string; autoMerge?: string }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-security-publish-'));
    roots.push(root);
    vi.stubEnv('GITHUB_REPOSITORY', repo);
    vi.stubEnv('GITHUB_RUN_ID', '7');
    vi.stubEnv('GITHUB_STEP_SUMMARY', '');
    vi.stubEnv('UPDATE_SHA', sha);
    vi.stubEnv('UPDATE_RESULT', options.result ?? 'success');
    vi.stubEnv('AUTO_MERGE', options.autoMerge ?? 'true');
    vi.stubEnv('PUBLISH_UPDATE_STATUS', 'true');
    vi.stubEnv('DEFAULT_BRANCH', 'main');
    vi.stubEnv(
      'UPDATE_REPORT',
      Buffer.from(
        JSON.stringify([
          {
            project: '.',
            before: { total: 6 },
            after: { total: 0 },
            overrides: [{ name: 'minimatch', from: '10.2.6', to: '^11.0.1', major: true }],
          },
        ]),
      ).toString('base64'),
    );
    const gh = vi.fn((args: string[]) => {
      const call = args.join(' ');
      if (call === `api repos/${repo}/git/ref/heads/codex/security-dependency-updates`)
        return JSON.stringify({ object: { sha } });
      if (call === `api repos/${repo}/git/ref/heads/main`)
        return JSON.stringify({ object: { sha: main } });
      if (call === `api repos/${repo}/git/commits/${sha}`)
        return JSON.stringify({ parents: [{ sha: options.parent ?? main }] });
      if (args[0] === 'pr' && args[1] === 'list') return '[]';
      if (args[0] === 'pr' && args[1] === 'create') return `https://github.com/${repo}/pull/42`;
      return '';
    });
    publish(root, gh);
    const body = fs.readFileSync(path.join(root, '.updates/security-review.txt'), 'utf8');
    return { calls: gh.mock.calls.map(([args]) => args as string[]), body };
  }
  const merges = (calls: string[][]) =>
    calls.filter((args) => args[0] === 'pr' && args[1] === 'merge');
  const reviews = (calls: string[][]) => calls.filter((args) => args.includes('--add-reviewer'));

  it('squash-merges the exact tested commit and removes the update branch', () => {
    const { calls, body } = run({});
    expect(merges(calls)).toHaveLength(1);
    expect(merges(calls)[0]).toEqual(
      expect.arrayContaining(['42', '--squash', '--match-head-commit', sha]),
    );
    expect(calls).toContainEqual([
      'api',
      '--method',
      'DELETE',
      `repos/${repo}/git/refs/heads/codex/security-dependency-updates`,
    ]);
    expect(reviews(calls)).toHaveLength(0);
    expect(body).toContain('merged automatically');
    expect(body).toContain('`minimatch` 10.2.6 raised to `^11.0.1` - **new major version');
  });
  it('waits for the next run when the default branch moved after testing', () => {
    const { calls } = run({ parent: 'c'.repeat(40) });
    expect(merges(calls)).toHaveLength(0);
    expect(reviews(calls)).toHaveLength(0);
  });
  it('never merges failed checks and keeps them as a draft', () => {
    const { calls } = run({ result: 'failure' });
    expect(merges(calls)).toHaveLength(0);
    expect(calls.find((args) => args[1] === 'create')).toContain('--draft');
  });
  it('falls back to requesting review when automatic merging is off', () => {
    const { calls, body } = run({ autoMerge: 'false' });
    expect(merges(calls)).toHaveLength(0);
    expect(reviews(calls)).toHaveLength(1);
    expect(body).toContain('Your approval is required');
  });
});
