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
  updateProject,
} = require('../../scripts/security-maintenance.js');
const roots: string[] = [];
afterEach(() => {
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
});
