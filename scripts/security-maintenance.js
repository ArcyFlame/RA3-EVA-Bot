'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { npmCommand } = require('./lib/updater');

const BRANCH = 'codex/security-dependency-updates';
const PROJECTS = ['.', 'tools/discord-test-mcp'];
const FILES = [
  'package.json',
  'package-lock.json',
  'tools/discord-test-mcp/package.json',
  'tools/discord-test-mcp/package-lock.json',
];
const SHA = /^[a-f0-9]{40}$/;
const BOT = 'github-actions[bot]';

function run(file, args, cwd, allowed = [0], env = process.env) {
  const result = spawnSync(file, args, {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || !allowed.includes(result.status))
    throw new Error(
      `${path.basename(file)} failed (${result.status ?? 'timeout'}). ${String(result.stderr || '').slice(-1500)}`,
    );
  return result.stdout.trim();
}

function npm(args, cwd, allowed = [0]) {
  const [file, argv] = npmCommand(args);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/TOKEN|SECRET|PASSWORD|NODE_OPTIONS|NODE_PATH/i.test(key),
    ),
  );
  return run(file, argv, cwd, allowed, {
    ...env,
    npm_config_ignore_scripts: 'true',
    npm_config_fetch_retries: '1',
    npm_config_fetch_timeout: '30000',
  });
}

function compatibleVersion(before, after) {
  const parse = (value) =>
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.split('.').map(Number) : null;
  const left = parse(before),
    right = parse(after);
  if (!left || !right || left[0] !== right[0]) return false;
  if (left[0] === 0 && (left[1] !== right[1] || (left[1] === 0 && left[2] !== right[2])))
    return false;
  return right[1] > left[1] || (right[1] === left[1] && right[2] >= left[2]);
}

function assertCompatible(before, after, oldLock, newLock) {
  const fields = ['dependencies', 'devDependencies', 'optionalDependencies'];
  const rest = (manifest) =>
    Object.fromEntries(Object.entries(manifest).filter(([key]) => !fields.includes(key)));
  if (!isDeepStrictEqual(rest(before), rest(after)))
    throw new Error('Update changed non-dependency manifest settings. Manual review required.');
  for (const field of fields) {
    const oldDeps = before[field] || {},
      newDeps = after[field] || {};
    if (!isDeepStrictEqual(Object.keys(oldDeps).sort(), Object.keys(newDeps).sort()))
      throw new Error('Update added or removed a direct dependency. Manual review required.');
    for (const name of Object.keys(oldDeps)) {
      if (oldDeps[name] === newDeps[name]) continue;
      const oldRange = /^([~^]?)(\d+\.\d+\.\d+)$/.exec(oldDeps[name]);
      const newRange = /^([~^]?)(\d+\.\d+\.\d+)$/.exec(newDeps[name]);
      if (
        !oldRange ||
        !newRange ||
        oldRange[1] !== newRange[1] ||
        !compatibleVersion(oldRange[2], newRange[2])
      )
        throw new Error(`Incompatible direct update for ${name}. Manual review required.`);
    }
  }
  // Keep direct dependency release lines stable. A compatible parent release
  // may legitimately update its own compiler/parser internals across versions;
  // those transitive changes are covered by the complete test matrix.
  const directPaths = new Set(
    fields.flatMap((field) =>
      Object.keys(before[field] || {}).map((name) => `node_modules/${name}`),
    ),
  );
  for (const [key, entry] of Object.entries(newLock.packages || {})) {
    const old = oldLock.packages?.[key];
    if (
      directPaths.has(key) &&
      old?.version &&
      entry.version &&
      old.version !== entry.version &&
      !compatibleVersion(old.version, entry.version)
    )
      throw new Error(`Incompatible locked update at ${key}. Manual review required.`);
  }
}

function compatibleCandidate(spec, current, versions) {
  const range = /^([~^]?)(\d+\.\d+\.\d+)$/.exec(spec);
  if (!range) return undefined;
  const candidates = (Array.isArray(versions) ? versions : [versions]).filter(
    (version) =>
      typeof version === 'string' &&
      version !== current &&
      compatibleVersion(current, version) &&
      compatibleVersion(range[2], version) &&
      (range[1] === '^' || version.split('.')[1] === range[2].split('.')[1]),
  );
  return candidates.sort((a, b) => (compatibleVersion(a, b) ? -1 : 1)).at(-1);
}

function audit(cwd, npmRun = npm) {
  const report = JSON.parse(
    npmRun(['audit', '--json', '--package-lock-only', '--include=dev'], cwd, [0, 1]),
  );
  if (report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities)
    throw new Error('Dependency audit could not complete. No clean audit is being claimed.');
  return report;
}

function summary(report) {
  return {
    total: report.metadata.vulnerabilities.total,
    packages: Object.keys(report.vulnerabilities).sort(),
  };
}

function updateProject(root, project, npmRun = npm) {
  const cwd = path.resolve(root, project);
  const manifestPath = path.join(cwd, 'package.json'),
    lockPath = path.join(cwd, 'package-lock.json');
  const before = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const oldLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const initial = audit(cwd, npmRun);
  if (initial.metadata.vulnerabilities.total > 0) {
    // No lifecycle scripts or forced upgrades. npm may return 1 when manual fixes remain.
    npmRun(
      ['audit', 'fix', '--package-lock-only', '--ignore-scripts', '--include=dev', '--no-fund'],
      cwd,
      [0, 1],
    );
    // Ask for published versions inside the existing release line. npm's default
    // latest tag may point to a new major and leave a patched older line locked.
    const remaining = audit(cwd, npmRun);
    const direct = new Set(
      Object.entries(remaining.vulnerabilities).flatMap(([name, finding]) => [
        ...(finding.isDirect ? [name] : []),
        ...(typeof finding.fixAvailable === 'object' && finding.fixAvailable
          ? [finding.fixAvailable.name]
          : []),
      ]),
    );
    for (const name of direct) {
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) continue;
      const field = ['dependencies', 'devDependencies', 'optionalDependencies'].find(
        (key) => before[key]?.[name],
      );
      const spec = field && before[field][name];
      const range = spec && /^([~^]?)(\d+\.\d+\.\d+)$/.exec(spec);
      if (!range) continue;
      const current = oldLock.packages?.[`node_modules/${name}`]?.version || range[2];
      const versions = JSON.parse(
        npmRun(['view', `${name}@${range[1] ? spec : '~' + spec}`, 'version', '--json'], cwd),
      );
      const candidate = compatibleCandidate(spec, current, versions);
      if (!candidate) continue;
      const flag =
        field === 'devDependencies'
          ? '--save-dev'
          : field === 'optionalDependencies'
            ? '--save-optional'
            : '--save-prod';
      npmRun(
        [
          'install',
          `${name}@${candidate}`,
          flag,
          ...(range[1] ? ['--save-exact=false', `--save-prefix=${range[1]}`] : ['--save-exact']),
          '--package-lock-only',
          '--ignore-scripts',
          '--include=dev',
          '--no-audit',
          '--no-fund',
        ],
        cwd,
      );
    }
  }
  const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const newLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assertCompatible(before, after, oldLock, newLock);
  return { project, before: summary(initial), after: summary(audit(cwd, npmRun)) };
}

function assertFiles(files) {
  if (files.some((file) => !FILES.includes(file)))
    throw new Error('Automation may change only the two packages and their lockfiles.');
}

function prepare(root) {
  const git = (args, allowed) => run('git', args, root, allowed);
  if (git(['status', '--porcelain'])) throw new Error('Start from a clean checkout.');
  const base = git(['rev-parse', 'HEAD']);
  const reference = `refs/remotes/origin/${BRANCH}`;
  const existing = git(['rev-parse', '--verify', reference], [0, 128]);
  const previous = SHA.test(existing) ? existing : '';
  if (previous) {
    const author = git(['show', '-s', '--format=%an', previous]);
    assertFiles(
      git(['diff', '--name-only', `HEAD...${previous}`])
        .split('\n')
        .filter(Boolean),
    );
    if (author !== BOT)
      throw new Error('Automation branch contains a human commit. Review it before refreshing.');
  }
  const report = PROJECTS.map((project) => updateProject(root, project));
  const files = git(['diff', '--name-only']).split('\n').filter(Boolean);
  assertFiles(files);
  const pending = files.length > 0;
  let sha = base;
  if (pending) {
    const same = previous && git(['rev-parse', `${previous}^`]) === base;
    const identical =
      same &&
      spawnSync('git', ['diff', '--quiet', previous, '--', ...FILES], {
        cwd: root,
        windowsHide: true,
      }).status === 0;
    if (identical) sha = previous;
    else {
      git(['add', '--', ...FILES]);
      git([
        '-c',
        `user.name=${BOT}`,
        '-c',
        'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit',
        '-m',
        'Prepare compatible dependency security fixes',
      ]);
      sha = git(['rev-parse', 'HEAD']);
    }
  } else if (report.some((item) => item.after.total > 0))
    throw new Error(
      'Security findings remain and no compatible update is available. Manual review required.',
    );
  const state = { base, sha, previous, pending, report };
  fs.mkdirSync(path.join(root, '.updates'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.updates/security-maintenance.json'),
    JSON.stringify(state, null, 2),
  );
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_updates=${pending}\nsha=${sha}\nreport=${Buffer.from(JSON.stringify(report)).toString('base64')}\n`,
    );
  console.log(JSON.stringify({ pending, sha, report }, null, 2));
  return state;
}

function push(root) {
  const state = JSON.parse(
    fs.readFileSync(path.join(root, '.updates/security-maintenance.json'), 'utf8'),
  );
  if (!state.pending) return;
  if (!SHA.test(state.sha) || (state.previous && !SHA.test(state.previous)))
    throw new Error('Invalid automation commit.');
  const origin = run('git', ['remote', 'get-url', 'origin'], root);
  if (
    origin !== 'https://github.com/ArcyFlame/RA3-EVA-Bot' &&
    origin !== 'https://github.com/ArcyFlame/RA3-EVA-Bot.git'
  )
    throw new Error('Unexpected Git remote.');
  assertFiles(
    run('git', ['diff', '--name-only', `${state.base}...${state.sha}`], root)
      .split('\n')
      .filter(Boolean),
  );
  run(
    'git',
    [
      'push',
      `--force-with-lease=refs/heads/${BRANCH}:${state.previous}`,
      'origin',
      `${state.sha}:refs/heads/${BRANCH}`,
    ],
    root,
  );
}

function shouldRequestReview(previousBody, sha, passed) {
  return (
    passed &&
    (!previousBody ||
      !previousBody.includes(`Tested commit: \`${sha}\``) ||
      !previousBody.includes('Status: **Ready for your review**'))
  );
}

function publish(root) {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.UPDATE_SHA;
  if (repository !== 'ArcyFlame/RA3-EVA-Bot' || !SHA.test(sha || ''))
    throw new Error('Unexpected repository or commit.');
  const gh = (args) => run('gh', args, root);
  const branch = JSON.parse(gh(['api', `repos/${repository}/git/ref/heads/${BRANCH}`]));
  if (branch.object.sha !== sha)
    throw new Error(
      'Update branch changed after testing. No review-ready status will be published.',
    );
  const passed = process.env.UPDATE_RESULT === 'success';
  const report = JSON.parse(
    Buffer.from(process.env.UPDATE_REPORT || '', 'base64').toString('utf8'),
  );
  const runUrl = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  // Reusable validation runs belong to the scheduler's commit. Publish the
  // result on the dependency commit too, so reviewers see it in the PR checks.
  if (process.env.PUBLISH_UPDATE_STATUS === 'true')
    gh([
      'api',
      '--method',
      'POST',
      `repos/${repository}/statuses/${sha}`,
      '-f',
      `state=${passed ? 'success' : 'failure'}`,
      '-f',
      'context=Security update validation',
      '-f',
      `target_url=${runUrl}`,
      '-f',
      `description=${passed ? 'Windows/Linux Node 22 and 24 checks passed' : 'Validation needs attention - see workflow logs'}`,
    ]);
  const body = [
    'Compatible dependency security fixes for the bot and optional Discord testing tool.',
    '',
    `Status: **${passed ? 'Ready for your review' : 'Needs attention - checks did not pass'}**`,
    `Tested commit: \`${sha}\``,
    `[Windows/Linux validation](${runUrl})`,
    '',
    ...report.map(
      (item) =>
        `- ${item.project === '.' ? 'Bot' : 'Discord testing tool'}: ${item.before.total} affected packages before, ${item.after.total} remaining.`,
    ),
    '',
    'Your approval is required before merging and publishing a new bot release. This workflow never merges, approves, tags or publishes a release.',
    'Major upgrades and incompatible fixes require separate review.',
  ].join('\n');
  const title = passed
    ? 'Security updates - tested and ready for review'
    : 'Security updates - checks need attention';
  const file = path.join(root, '.updates/security-review.txt');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  const prs = JSON.parse(
    gh([
      'pr',
      'list',
      '--repo',
      repository,
      '--head',
      BRANCH,
      '--base',
      process.env.DEFAULT_BRANCH || 'main',
      '--state',
      'open',
      '--json',
      'number,body,isDraft,headRefOid,author',
    ]),
  );
  if (prs.length > 1) throw new Error('Multiple automation PRs found. Manual review required.');
  const previous = prs[0];
  let number;
  if (previous) {
    if (previous.author?.login !== 'app/github-actions' && previous.author?.login !== BOT)
      throw new Error('Existing automation PR is not owned by GitHub Actions.');
    if (previous.headRefOid !== sha) throw new Error('Pull request commit changed after testing.');
    number = previous.number;
    gh(['pr', 'edit', String(number), '--repo', repository, '--title', title, '--body-file', file]);
    if (previous.isDraft === passed)
      gh(['pr', 'ready', String(number), '--repo', repository, ...(passed ? [] : ['--undo'])]);
  } else {
    const url = gh([
      'pr',
      'create',
      '--repo',
      repository,
      '--base',
      process.env.DEFAULT_BRANCH || 'main',
      '--head',
      BRANCH,
      '--title',
      title,
      '--body-file',
      file,
      ...(passed ? [] : ['--draft']),
    ]);
    number = Number(url.match(/\/pull\/(\d+)$/)?.[1]);
    if (!number) throw new Error('Could not identify the created security PR.');
  }
  if (shouldRequestReview(previous?.body, sha, passed))
    gh(['pr', 'edit', String(number), '--repo', repository, '--add-reviewer', 'ArcyFlame']);
  const url = `https://github.com/${repository}/pull/${number}`;
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${passed ? 'Ready for approval' : 'Needs attention'}: ${url}\n\n${body}\n`,
    );
  console.log(url);
}

if (require.main === module) {
  try {
    const root = process.cwd();
    const action = process.argv[2];
    if (action === 'prepare') prepare(root);
    else if (action === 'push') push(root);
    else if (action === 'publish') publish(root);
    else throw new Error('Use prepare, push or publish.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = {
  compatibleVersion,
  compatibleCandidate,
  assertCompatible,
  assertFiles,
  updateProject,
  prepare,
  shouldRequestReview,
};
