import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as h from './report-site.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTING_DIR = __dirname;

// Integration coverage for the schedule cleanup path in report-prepare.mjs.
// The orchestrator auto-runs main() on import, so it is exercised as a
// subprocess with a temp state tree.

function writeRefFiles(stateDir, refs) {
  mkdirSync(join(stateDir, 'refs'), { recursive: true });
  for (const r of refs) writeFileSync(join(stateDir, 'refs', `${r.slug}.json`), JSON.stringify(r, null, 2) + '\n');
}

function writeHistory(stateDir, slug, suites) {
  for (const suite of suites) {
    mkdirSync(join(stateDir, 'history', slug), { recursive: true });
    writeFileSync(join(stateDir, 'history', slug, `${suite}.jsonl`), '{"launch":"x"}\n');
  }
}

function writeReport(pagesDir, slug, suite, content = slug) {
  const dir = join(pagesDir, 'reports', slug, suite);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), content);
}

function writeInternalPagesData(pagesDir) {
  mkdirSync(join(pagesDir, '.git'), { recursive: true });
  mkdirSync(join(pagesDir, '_state'), { recursive: true });
  writeFileSync(join(pagesDir, '.git', 'config'), 'internal git data');
  writeFileSync(join(pagesDir, '_state', 'secret'), 'internal state');
  writeFileSync(join(pagesDir, 'index.html'), 'stale root index');
  writeFileSync(join(pagesDir, 'manifest.json'), 'stale root manifest');
}

function writeFakeAllure(base) {
  const path = join(base, 'fake-allure.mjs');
  writeFileSync(path, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const output = process.argv[process.argv.indexOf('--output') + 1];
mkdirSync(join(output, 'report-data'), { recursive: true });
writeFileSync(join(output, 'index.html'), 'generated report');
writeFileSync(join(output, 'summary.json'), '{}');
writeFileSync(join(output, 'report-data', 'data.json'), '{}');
`);
  chmodSync(path, 0o755);
  return path;
}

function makeRef(slug, runNumber) {
  const source = {
    runId: runNumber, runNumber, runAttempt: 1, headSha: '0123456789abcdef',
    event: 'pull_request', conclusion: 'success', url: '', completedAt: '2026-07-01T00:00:00Z', prNumber: runNumber,
  };
  return h.buildRefMetadata({
    slug, displayName: `PR #${runNumber}`, source,
    suites: {
      unit: { availability: 'generated', status: 'passed', stats: { total: 1, passed: 1 } },
      regular: { availability: 'generated', status: 'passed', stats: { total: 1, passed: 1 } },
      quarantine: { availability: 'not-run' },
    },
  });
}

function runPrepare(env) {
  return spawnSync(process.execPath, [join(REPORTING_DIR, 'report-prepare.mjs')], {
    cwd: REPORTING_DIR,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('schedule cleanup: expired PR history is not re-added (orphan pruning)', () => {
  const base = mkdtempSync(join(tmpdir(), 'rp-schedule-'));
  try {
    const existingStateDir = join(base, 'existing');
    const existingPagesDir = join(base, 'existing-pages');
    const outStateDir = join(base, 'state-out');
    const outPagesDir = join(base, 'pages-out');
    mkdirSync(outStateDir, { recursive: true });
    mkdirSync(outPagesDir, { recursive: true });

    const expired = h.markClosed(makeRef('pr-2', 2), '2026-07-01T00:00:00Z'); // expires 2026-07-08
    const openRef = makeRef('pr-1', 1);
    writeRefFiles(existingStateDir, [expired, openRef]);
    writeHistory(existingStateDir, 'pr-2', ['unit', 'regular']);
    writeHistory(existingStateDir, 'pr-1', ['unit', 'regular']);
    writeReport(existingPagesDir, 'pr-2', 'regular', 'expired report');
    writeReport(existingPagesDir, 'pr-1', 'regular', 'retained report');
    writeInternalPagesData(existingPagesDir);

    const res = runPrepare({
      REPORT_EVENT: 'schedule',
      OUT_STATE_DIR: outStateDir,
      OUT_PAGES_DIR: outPagesDir,
      EXISTING_STATE_DIR: existingStateDir,
      EXISTING_PAGES_DIR: existingPagesDir,
      GITHUB_REPOSITORY: 'trusovn/petstore-v2-tests',
      CLEANUP_NOW: '2026-07-11T00:00:00Z',
    });
    assert.equal(res.status, 0, `report-prepare failed:\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);

    // Expired ref removed; open ref retained.
    assert.equal(existsSync(join(outStateDir, 'refs', 'pr-2.json')), false);
    assert.equal(existsSync(join(outStateDir, 'refs', 'pr-1.json')), true);
    // Regression guard: copyExistingHistory used to re-add the expired slug's
    // history; the prune-after-copy step must remove it.
    assert.equal(existsSync(join(outStateDir, 'history', 'pr-2', 'regular.jsonl')), false, 'expired PR history was re-added (orphan)');
    assert.equal(existsSync(join(outStateDir, 'history', 'pr-1', 'regular.jsonl')), true, 'retained PR history was lost');
    assert.equal(existsSync(join(outPagesDir, 'reports', 'pr-2')), false, 'expired PR report was retained');
    assert.equal(existsSync(join(outPagesDir, 'reports', 'pr-1', 'regular', 'index.html')), true, 'retained PR report was lost');
    assert.equal(existsSync(join(outPagesDir, '.git')), false);
    assert.equal(existsSync(join(outPagesDir, '_state')), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('schedule cleanup: nothing expired leaves state intact', () => {
  const base = mkdtempSync(join(tmpdir(), 'rp-schedule-none-'));
  try {
    const existingStateDir = join(base, 'existing');
    const outStateDir = join(base, 'state-out');
    const outPagesDir = join(base, 'pages-out');
    mkdirSync(outStateDir, { recursive: true });
    mkdirSync(outPagesDir, { recursive: true });

    writeRefFiles(existingStateDir, [makeRef('pr-1', 1)]);
    writeHistory(existingStateDir, 'pr-1', ['unit']);

    const res = runPrepare({
      REPORT_EVENT: 'schedule',
      OUT_STATE_DIR: outStateDir,
      OUT_PAGES_DIR: outPagesDir,
      EXISTING_STATE_DIR: existingStateDir,
      GITHUB_REPOSITORY: 'trusovn/petstore-v2-tests',
      CLEANUP_NOW: '2026-07-04T00:00:00Z',
    });
    assert.equal(res.status, 0, `report-prepare failed:\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.equal(existsSync(join(outStateDir, 'refs', 'pr-1.json')), true);
    assert.equal(existsSync(join(outStateDir, 'history', 'pr-1', 'unit.jsonl')), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('PR lifecycle update retains every public report and history without copying internal branch data', () => {
  const base = mkdtempSync(join(tmpdir(), 'rp-lifecycle-'));
  try {
    const existingStateDir = join(base, 'existing');
    const existingPagesDir = join(base, 'existing-pages');
    const outStateDir = join(base, 'state-out');
    const outPagesDir = join(base, 'pages-out');
    const closing = makeRef('pr-1', 1);
    const other = makeRef('pr-2', 2);

    writeRefFiles(existingStateDir, [closing, other]);
    writeHistory(existingStateDir, 'pr-1', ['unit']);
    writeHistory(existingStateDir, 'pr-2', ['regular']);
    writeReport(existingPagesDir, 'pr-1', 'unit', 'closing report');
    writeReport(existingPagesDir, 'pr-2', 'regular', 'other report');
    writeInternalPagesData(existingPagesDir);

    const res = runPrepare({
      REPORT_EVENT: 'pull_request',
      PR_ACTION: 'closed',
      PR_NUMBER: '1',
      PR_CLOSED_AT: '2026-07-04T00:00:00Z',
      OUT_STATE_DIR: outStateDir,
      OUT_PAGES_DIR: outPagesDir,
      EXISTING_STATE_DIR: existingStateDir,
      EXISTING_PAGES_DIR: existingPagesDir,
      GITHUB_REPOSITORY: 'trusovn/petstore-v2-tests',
    });
    assert.equal(res.status, 0, `report-prepare failed:\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);

    assert.equal(existsSync(join(outPagesDir, 'reports', 'pr-1', 'unit', 'index.html')), true);
    assert.equal(existsSync(join(outPagesDir, 'reports', 'pr-2', 'regular', 'index.html')), true);
    assert.equal(existsSync(join(outStateDir, 'history', 'pr-1', 'unit.jsonl')), true);
    assert.equal(existsSync(join(outStateDir, 'history', 'pr-2', 'regular.jsonl')), true);
    assert.equal(existsSync(join(outPagesDir, '.git')), false);
    assert.equal(existsSync(join(outPagesDir, '_state')), false);
    assert.notEqual(readFileSync(join(outPagesDir, 'index.html'), 'utf8'), 'stale root index');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('workflow publication replaces generated paths while retaining other refs reports and history', () => {
  const base = mkdtempSync(join(tmpdir(), 'rp-publication-'));
  try {
    const existingStateDir = join(base, 'existing');
    const existingPagesDir = join(base, 'existing-pages');
    const artifactDir = join(base, 'artifact');
    const outStateDir = join(base, 'state-out');
    const outPagesDir = join(base, 'pages-out');
    const main = makeRef('main', 1);
    main.displayName = 'main';
    main.source.event = 'push';
    main.source.prNumber = null;
    const other = makeRef('pr-2', 2);

    writeRefFiles(existingStateDir, [main, other]);
    writeHistory(existingStateDir, 'main', ['unit']);
    writeHistory(existingStateDir, 'pr-2', ['regular']);
    writeReport(existingPagesDir, 'main', 'unit', 'old main report');
    writeFileSync(join(existingPagesDir, 'reports', 'main', 'unit', 'stale.txt'), 'stale');
    writeReport(existingPagesDir, 'main', 'regular', 'old unavailable suite');
    writeReport(existingPagesDir, 'pr-2', 'regular', 'other report');
    mkdirSync(join(artifactDir, 'unit'), { recursive: true });
    writeFileSync(join(artifactDir, 'unit', 'passed-result.json'), JSON.stringify({ name: 'passed', status: 'passed' }));
    const fakeAllure = writeFakeAllure(base);

    const res = runPrepare({
      REPORT_EVENT: 'workflow_run',
      SOURCE_EVENT: 'push',
      SOURCE_CONCLUSION: 'success',
      SOURCE_HEAD_BRANCH: 'main',
      SOURCE_HEAD_REPO_FULL: 'trusovn/petstore-v2-tests',
      SOURCE_RUN_ID: '3',
      SOURCE_RUN_NUMBER: '3',
      SOURCE_RUN_ATTEMPT: '1',
      SOURCE_HEAD_SHA: 'abcdef0123456789',
      OUT_STATE_DIR: outStateDir,
      OUT_PAGES_DIR: outPagesDir,
      EXISTING_STATE_DIR: existingStateDir,
      EXISTING_PAGES_DIR: existingPagesDir,
      ALLURE_ARTIFACT_DIR: artifactDir,
      ALLURE_BIN: fakeAllure,
      WORK_ROOT: join(base, 'work'),
      GITHUB_REPOSITORY: 'trusovn/petstore-v2-tests',
    });
    assert.equal(res.status, 0, `report-prepare failed:\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);

    assert.equal(existsSync(join(outPagesDir, 'reports', 'pr-2', 'regular', 'index.html')), true);
    assert.equal(readFileSync(join(outPagesDir, 'reports', 'main', 'unit', 'index.html'), 'utf8'), 'generated report');
    assert.equal(existsSync(join(outPagesDir, 'reports', 'main', 'unit', 'stale.txt')), false);
    assert.equal(existsSync(join(outPagesDir, 'reports', 'main', 'regular')), false);
    assert.equal(existsSync(join(outStateDir, 'history', 'pr-2', 'regular.jsonl')), true);
    assert.equal(existsSync(join(outStateDir, 'history', 'main', 'unit.jsonl')), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
