import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as h from './report-site.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'test-fixtures', 'results');

function loadResult(name) {
  return JSON.parse(readFileSync(join(FIX, name), 'utf8'));
}
const passedResult = loadResult('passed-result.json');
const failedResult = loadResult('failed-result.json');
const skippedResult = loadResult('skipped-result.json');

function makeSource(overrides = {}) {
  return {
    runId: 1,
    runNumber: 1,
    runAttempt: 1,
    headSha: '0123456789abcdef',
    event: 'pull_request',
    conclusion: 'success',
    url: 'https://github.com/trusovn/petstore-v2-tests/actions/runs/1',
    completedAt: '2026-07-04T12:00:00Z',
    prNumber: 123,
    ...overrides,
  };
}

function makeRef(slug = 'pr-123', sourceOverrides = {}, suiteOverrides = {}) {
  const src = makeSource(sourceOverrides);
  return h.buildRefMetadata({
    slug,
    displayName: slug === 'main' ? 'main' : `PR #${slug.replace('pr-', '')}`,
    source: src,
    suites: {
      unit: { availability: 'generated', status: 'passed', stats: { total: 11, passed: 11 }, ...suiteOverrides.unit },
      regular: { availability: 'generated', status: 'passed', stats: { total: 9, passed: 9 }, ...suiteOverrides.regular },
      quarantine: { availability: 'generated', ...suiteOverrides.quarantine },
    },
  });
}

// ---------------------------------------------------------------------------
// 1. main and numeric PR slug resolution
// ---------------------------------------------------------------------------
test('resolveSlug: main from push', () => {
  assert.equal(h.resolveSlug({ event: 'push', headBranch: 'main' }), 'main');
});
test('resolveSlug: push on non-main branch rejected', () => {
  assert.throws(() => h.resolveSlug({ event: 'push', headBranch: 'feature' }));
});
test('resolveSlug: pr-<number> from pull_request', () => {
  assert.equal(h.resolveSlug({ event: 'pull_request', prNumber: 42 }), 'pr-42');
});
test('resolveSlug: invalid PR number rejected', () => {
  assert.throws(() => h.resolveSlug({ event: 'pull_request', prNumber: 0 }));
  assert.throws(() => h.resolveSlug({ event: 'pull_request', prNumber: 'abc' }));
});
test('resolveSlug: workflow_dispatch only durable for main', () => {
  assert.equal(h.resolveSlug({ event: 'workflow_dispatch', headBranch: 'main' }), 'main');
  assert.throws(() => h.resolveSlug({ event: 'workflow_dispatch', headBranch: 'feature' }));
});
test('resolveSlug: arbitrary event rejected', () => {
  assert.throws(() => h.resolveSlug({ event: 'schedule' }));
});

// ---------------------------------------------------------------------------
// 2. rejection of arbitrary events, foreign head repos, ambiguous PR assoc.
// ---------------------------------------------------------------------------
test('validateSourceRun: accepts pull_request/push/workflow_dispatch', () => {
  for (const event of h.ACCEPTED_SOURCE_EVENTS) {
    const headBranch = event === 'push' ? 'main' : 'feature';
    assert.doesNotThrow(() =>
      h.validateSourceRun({ event, headRepositoryFullName: h.REPO_FULL_NAME, githubRepository: h.REPO_FULL_NAME, headBranch, conclusion: 'success' }),
    );
  }
});
test('validateSourceRun: rejects arbitrary event', () => {
  assert.throws(() =>
    h.validateSourceRun({ event: 'schedule', headRepositoryFullName: h.REPO_FULL_NAME, githubRepository: h.REPO_FULL_NAME, headBranch: 'main', conclusion: 'success' }),
  );
});
test('validateSourceRun: rejects foreign head repository', () => {
  assert.throws(() =>
    h.validateSourceRun({ event: 'pull_request', headRepositoryFullName: 'fork/repo', githubRepository: h.REPO_FULL_NAME, headBranch: 'feature', conclusion: 'success' }),
  );
});
test('validateSourceRun: rejects cancelled conclusion', () => {
  assert.throws(() =>
    h.validateSourceRun({ event: 'pull_request', headRepositoryFullName: h.REPO_FULL_NAME, githubRepository: h.REPO_FULL_NAME, headBranch: 'feature', conclusion: 'cancelled' }),
  );
});
test('validateSourceRun: rejects push not on main', () => {
  assert.throws(() =>
    h.validateSourceRun({ event: 'push', headRepositoryFullName: h.REPO_FULL_NAME, githubRepository: h.REPO_FULL_NAME, headBranch: 'dev', conclusion: 'success' }),
  );
});
test('resolvePrNumber: single association', () => {
  assert.equal(h.resolvePrNumber({ pullRequests: [{ number: 7 }] }), 7);
});
test('resolvePrNumber: ambiguous association rejected', () => {
  assert.throws(() => h.resolvePrNumber({ pullRequests: [{ number: 1 }, { number: 2 }] }));
});
test('resolvePrNumber: empty with explicit prNumber', () => {
  assert.equal(h.resolvePrNumber({ pullRequests: [], prNumber: 5 }), 5);
});
test('resolvePrNumber: nothing available rejected', () => {
  assert.throws(() => h.resolvePrNumber({ pullRequests: [] }));
});

// ---------------------------------------------------------------------------
// 3. ordering by (runNumber, runAttempt)
// ---------------------------------------------------------------------------
test('compareRuns: newer runNumber wins', () => {
  assert.ok(h.compareRuns({ runNumber: 2, runAttempt: 1 }, { runNumber: 1, runAttempt: 1 }) > 0);
});
test('compareRuns: same runNumber, newer runAttempt wins', () => {
  assert.ok(h.compareRuns({ runNumber: 1, runAttempt: 2 }, { runNumber: 1, runAttempt: 1 }) > 0);
});
test('compareRuns: identical => 0', () => {
  assert.equal(h.compareRuns({ runNumber: 1, runAttempt: 1 }, { runNumber: 1, runAttempt: 1 }), 0);
});

// ---------------------------------------------------------------------------
// 4. same-run idempotency
// ---------------------------------------------------------------------------
test('decidePublication: no stored => publish', () => {
  assert.equal(h.decidePublication(null, makeSource()), 'publish');
});
test('decidePublication: older incoming => skip-older', () => {
  const stored = makeRef('pr-123', { runNumber: 2 });
  assert.equal(h.decidePublication(stored, makeSource({ runNumber: 1 })), 'skip-older');
});
test('decidePublication: identical => idempotent', () => {
  const stored = makeRef('pr-123', { runNumber: 1, runAttempt: 1 });
  assert.equal(h.decidePublication(stored, makeSource({ runNumber: 1, runAttempt: 1 })), 'idempotent');
});
test('decidePublication: newer => publish', () => {
  const stored = makeRef('pr-123', { runNumber: 1, runAttempt: 1 });
  assert.equal(h.decidePublication(stored, makeSource({ runNumber: 2, runAttempt: 1 })), 'publish');
});

// ---------------------------------------------------------------------------
// 5. partial suite availability
// ---------------------------------------------------------------------------
test('classifySuite: generated when results present', () => {
  assert.equal(h.classifySuite({ reached: true, hasResults: true }), 'generated');
});
test('classifySuite: missing when reached without results', () => {
  assert.equal(h.classifySuite({ reached: true, hasResults: false }), 'missing');
});
test('classifySuite: not-run when not reached', () => {
  assert.equal(h.classifySuite({ reached: false, hasResults: false }), 'not-run');
});

// ---------------------------------------------------------------------------
// 5b. stats computation
// ---------------------------------------------------------------------------
test('computeSuiteStats: counts statuses', () => {
  const stats = h.computeSuiteStats([passedResult, failedResult, skippedResult, passedResult]);
  assert.equal(stats.total, 4);
  assert.equal(stats.passed, 2);
  assert.equal(stats.failed, 1);
  assert.equal(stats.skipped, 1);
});
test('suiteStatus: failed dominates', () => {
  assert.equal(h.suiteStatus({ total: 2, passed: 1, failed: 1, broken: 0, skipped: 0, unknown: 0 }), 'failed');
});
test('suiteStatus: all passed => passed', () => {
  assert.equal(h.suiteStatus({ total: 3, passed: 3, failed: 0, broken: 0, skipped: 0, unknown: 0 }), 'passed');
});
test('suiteStatus: empty => empty', () => {
  assert.equal(h.suiteStatus({ total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 }), 'empty');
});

// ---------------------------------------------------------------------------
// 6. quarantine report availability without quarantine stats
// ---------------------------------------------------------------------------
test('buildRefMetadata: quarantine has no status/stats', () => {
  const ref = makeRef('pr-1', {}, { quarantine: { availability: 'generated', status: 'failed', stats: { total: 5, failed: 5 } } });
  assert.equal(ref.suites.quarantine.status, null);
  assert.deepEqual(ref.suites.quarantine.stats, {});
  assert.equal(ref.suites.quarantine.availability, 'generated');
  assert.equal(ref.suites.quarantine.reportPath, 'reports/pr-1/quarantine/');
});
test('buildRefMetadata: unit/regular keep status/stats when generated', () => {
  const ref = makeRef('pr-1');
  assert.equal(ref.suites.unit.status, 'passed');
  assert.deepEqual(ref.suites.unit.stats, { total: 11, passed: 11 });
});
test('buildRefMetadata: non-generated suite has null status/empty stats', () => {
  const ref = h.buildRefMetadata({
    slug: 'pr-1', displayName: 'PR #1', source: makeSource(),
    suites: { unit: { availability: 'not-run' }, regular: { availability: 'missing' }, quarantine: { availability: 'not-run' } },
  });
  assert.equal(ref.suites.unit.status, null);
  assert.deepEqual(ref.suites.unit.stats, {});
  assert.equal(ref.suites.unit.reportPath, null);
  assert.equal(ref.suites.regular.availability, 'missing');
  assert.equal(ref.suites.quarantine.reportPath, null);
});

// ---------------------------------------------------------------------------
// 7. offline single-file bundle generation for manual run
// ---------------------------------------------------------------------------
test('renderOfflineRootIndex: links generated suites, labels missing not run', () => {
  const html = h.renderOfflineRootIndex({ unit: 'generated', regular: 'generated', quarantine: 'not-run' });
  assert.match(html, /href="\.\/unit\/index\.html"/);
  assert.match(html, /href="\.\/regular\/index\.html"/);
  assert.match(html, /quarantine — not run/);
  assert.match(html, /<!DOCTYPE html>/);
});

// ---------------------------------------------------------------------------
// 8. HTML and Markdown escaping
// ---------------------------------------------------------------------------
test('escapeHtml: escapes amp/lt/gt/quote', () => {
  assert.equal(h.escapeHtml('<a>&"\''), '&lt;a&gt;&amp;&quot;&#39;');
});
test('escapeMarkdown: escapes special chars', () => {
  assert.equal(h.escapeMarkdown('a`b*c'), 'a\\`b\\*c');
});
test('sanitizeForHtml: escapes and neutralizes', () => {
  assert.equal(h.sanitizeForHtml('@<x>'), '@\u200b&lt;x&gt;');
});

// ---------------------------------------------------------------------------
// 9. mention neutralization
// ---------------------------------------------------------------------------
test('neutralizeMentions: inserts zero-width space after @', () => {
  assert.equal(h.neutralizeMentions('@user'), '@\u200buser');
  assert.equal(h.neutralizeMentions('no mention'), 'no mention');
});

// ---------------------------------------------------------------------------
// 10. failure-list truncation
// ---------------------------------------------------------------------------
test('truncateFailureList: caps count and message length', () => {
  const failures = Array.from({ length: 25 }, (_, i) => ({ name: `Test${i}`, message: 'line1\nline2' }));
  const out = h.truncateFailureList(failures, { maxCount: 3, maxLen: 5 });
  assert.equal(out.length, 3);
  assert.equal(out[0].message, 'line1');
  assert.equal(out[0].name, 'Test0');
});
test('extractFailures: excludes passing, includes failed/broken', () => {
  const broken = { ...failedResult, status: 'broken', statusDetails: { message: 'boom' } };
  const out = h.extractFailures([passedResult, failedResult, broken]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'org.mtrusov.StoreOrderTests.createsOrder');
  assert.equal(out[1].message, 'boom');
});
test('extractFailures: does not include trace', () => {
  const out = h.extractFailures([failedResult]);
  assert.equal(out[0].message, failedResult.statusDetails.message);
  assert.ok(!('trace' in out[0]));
});

// ---------------------------------------------------------------------------
// 11. manifest sorting
// ---------------------------------------------------------------------------
test('sortRefs: main first, then open PRs newest first, then closed', () => {
  const refs = [
    makeRef('pr-1', { runNumber: 1 }),
    makeRef('pr-2', { runNumber: 5 }),
    h.markClosed(makeRef('pr-3', { runNumber: 10 }), '2026-07-04T00:00:00Z'),
    makeRef('main', { runNumber: 3 }),
  ];
  const sorted = h.sortRefs(refs);
  assert.equal(sorted[0].slug, 'main');
  assert.equal(sorted[1].slug, 'pr-2'); // open newest
  assert.equal(sorted[2].slug, 'pr-1');
  assert.equal(sorted[3].slug, 'pr-3'); // closed last
});
test('buildManifest: no quarantine counts/status', () => {
  const refs = [makeRef('main'), makeRef('pr-1')];
  const m = h.buildManifest(refs);
  for (const r of m.refs) {
    assert.equal(r.suites.quarantine.status, undefined);
    assert.equal(r.suites.quarantine.stats, undefined);
  }
});

// ---------------------------------------------------------------------------
// 12. close/reopen lifecycle transitions and exact 7-day expiration
// ---------------------------------------------------------------------------
test('markClosed: sets closed state and 7-day expiry', () => {
  const ref = h.markClosed(makeRef('pr-1'), '2026-07-04T00:00:00Z');
  assert.equal(ref.lifecycle.state, 'closed');
  assert.equal(ref.lifecycle.closedAt, '2026-07-04T00:00:00Z');
  assert.equal(ref.lifecycle.expiresAt, '2026-07-11T00:00:00.000Z');
});
test('markReopened: clears closedAt/expiresAt and reopens', () => {
  const ref = h.markReopened(h.markClosed(makeRef('pr-1'), '2026-07-04T00:00:00Z'));
  assert.equal(ref.lifecycle.state, 'open');
  assert.equal(ref.lifecycle.closedAt, null);
  assert.equal(ref.lifecycle.expiresAt, null);
});
test('isExpired: false before expiry, true at/after', () => {
  const ref = h.markClosed(makeRef('pr-1'), '2026-07-04T00:00:00Z');
  assert.equal(h.isExpired(ref, '2026-07-10T23:59:59Z'), false);
  assert.equal(h.isExpired(ref, '2026-07-11T00:00:00Z'), true);
  assert.equal(h.isExpired(ref, '2026-07-12T00:00:00Z'), true);
});
test('isExpired: open refs never expired', () => {
  assert.equal(h.isExpired(makeRef('pr-1'), '2030-01-01T00:00:00Z'), false);
});

// ---------------------------------------------------------------------------
// 13. scheduled cleanup of one expired PR without affecting others
// ---------------------------------------------------------------------------
test('partitionForCleanup: removes only expired closed PRs', () => {
  const refs = [
    makeRef('main'),
    makeRef('pr-1', { runNumber: 1 }),
    h.markClosed(makeRef('pr-2', { runNumber: 2 }), '2026-07-01T00:00:00Z'), // expired
    h.markClosed(makeRef('pr-3', { runNumber: 3 }), '2026-07-10T00:00:00Z'), // unexpired
  ];
  const { expired, retained } = h.partitionForCleanup(refs, '2026-07-08T00:00:00Z');
  assert.deepEqual(expired, ['pr-2']);
  assert.equal(retained.length, 3);
  assert.ok(retained.every((r) => r.slug !== 'pr-2'));
});
test('partitionForCleanup: never removes main or open PRs', () => {
  const refs = [makeRef('main'), makeRef('pr-1')];
  const { expired } = h.partitionForCleanup(refs, '2099-01-01T00:00:00Z');
  assert.deepEqual(expired, []);
});

// ---------------------------------------------------------------------------
// 14. rejection of symlinks and size-limit violations
// ---------------------------------------------------------------------------
test('validateTree: rejects symlinks', () => {
  assert.throws(() => h.validateTree([{ path: 'a', type: 'dir' }, { path: 'b', type: 'symlink' }]));
});
test('validateTree: rejects size over limit', () => {
  assert.throws(() =>
    h.validateTree([{ path: 'a', type: 'file', size: 11 }], { maxBytes: 10 }),
  );
});
test('validateTree: accepts valid tree and returns total', () => {
  const total = h.validateTree(
    [{ path: 'a', type: 'dir' }, { path: 'b', type: 'file', size: 5 }, { path: 'c', type: 'file', size: 3 }],
    { maxBytes: 10 },
  );
  assert.equal(total, 8);
});

// ---------------------------------------------------------------------------
// PR comment rendering: quarantine excluded, escaping, truncation, deploy note
// ---------------------------------------------------------------------------
test('renderPrComment: includes gate, unit/regular counts, quarantine link only', () => {
  const ref = makeRef('pr-123', { conclusion: 'failure', headSha: '0123456789abcdef' });
  ref.suites.regular._failures = h.extractFailures([failedResult]);
  const body = h.renderPrComment(ref, { pagesDeployOk: true });
  assert.match(body, /CI gate: failed/);
  assert.match(body, /\| Unit \|/);
  assert.match(body, /\| Regular \|/);
  assert.match(body, /Quarantine \| non-gating; stats excluded \|/);
  assert.ok(!/11 passed.*quarantine/i.test(body));
  assert.match(body, /Regular\/unit failures/);
  assert.match(body, /expected status code 400 but was 200/);
});
test('renderPrComment: deployment-failure note when not deployed', () => {
  const ref = makeRef('pr-1');
  const body = h.renderPrComment(ref, { pagesDeployOk: false });
  assert.match(body, /Pages deployment failed/);
});
test('renderPrComment: not-run note when a suite did not run', () => {
  const ref = h.buildRefMetadata({
    slug: 'pr-1', displayName: 'PR #1', source: makeSource({ conclusion: 'failure' }),
    suites: { unit: { availability: 'generated', status: 'passed', stats: { total: 1, passed: 1 } }, regular: { availability: 'not-run' }, quarantine: { availability: 'not-run' } },
  });
  const body = h.renderPrComment(ref);
  assert.match(body, /gating step stopped before later suites ran/);
});
test('wrapCommentBody: includes marker', () => {
  assert.ok(h.wrapCommentBody('x').startsWith(h.MARKER));
});
test('validatePrCommentLength: rejects oversized comment', () => {
  assert.throws(() => h.validatePrCommentLength('x'.repeat(h.LIMITS.prCommentChars + 1)));
});

// ---------------------------------------------------------------------------
// Landing page: quarantine link label, escaping, no quarantine counts
// ---------------------------------------------------------------------------
test('renderLandingPage: quarantine link labeled non-gating; stats excluded', () => {
  const html = h.renderLandingPage([makeRef('main'), makeRef('pr-1')]);
  assert.match(html, /non-gating; stats excluded/);
  assert.ok(!/>20 passed</.test(html));
  assert.ok(!/passed passed/.test(html));
  assert.match(html, /<!DOCTYPE html>/);
});
test('renderLandingPage: exposes freshness metadata and cache-busted manifest check', () => {
  const html = h.renderLandingPage([makeRef('main')], { generatedAt: '2026-07-07T13:57:11.966Z' });
  assert.match(html, /Dashboard last updated 2026-07-07T13:57:11\.966Z/);
  assert.match(html, /data-generated-at="2026-07-07T13:57:11\.966Z"/);
  assert.match(html, /new URL\('manifest\.json', window\.location\.href\)/);
  assert.match(html, /searchParams\.set\('fresh', Date\.now\(\)\.toString\(\)\)/);
  assert.match(html, /A newer dashboard is available/);
});
test('renderLandingPage: open PRs appear only in the open pull requests section', () => {
  const html = h.renderLandingPage([makeRef('main'), makeRef('pr-1')]);
  const [mainSection, openSection] = html.match(/<section>.*?<\/section>/gs);
  assert.doesNotMatch(mainSection, /PR #1/);
  assert.match(openSection, /PR #1/);
});
test('renderLandingPage: not run for unavailable suites', () => {
  const ref = h.buildRefMetadata({
    slug: 'pr-1', displayName: 'PR #1', source: makeSource(),
    suites: { unit: { availability: 'not-run' }, regular: { availability: 'missing' }, quarantine: { availability: 'not-run' } },
  });
  const html = h.renderLandingPage([ref]);
  assert.match(html, /not run/);
  assert.match(html, /unavailable/);
});
test('renderLandingPage: escapes display names', () => {
  const ref = h.buildRefMetadata({
    slug: 'pr-1', displayName: '<script>', source: makeSource(),
    suites: { unit: { availability: 'not-run' }, regular: { availability: 'not-run' }, quarantine: { availability: 'not-run' } },
  });
  const html = h.renderLandingPage([ref]);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<td class="ref"><script>/);
});

// ---------------------------------------------------------------------------
// Deep link construction with validated id
// ---------------------------------------------------------------------------
test('buildDeepLink: valid id yields fragment link', () => {
  assert.equal(
    h.buildDeepLink('https://example.com/reports/pr-1/unit/', '11111111-1111-1111-1111-111111111111'),
    'https://example.com/reports/pr-1/unit/#11111111-1111-1111-1111-111111111111',
  );
});
test('buildDeepLink: invalid id yields null', () => {
  assert.equal(h.buildDeepLink('https://example.com/reports/pr-1/unit/', 'not-a-uuid'), null);
  assert.equal(h.buildDeepLink('https://example.com/reports/pr-1/unit/', '../../../etc/passwd'), null);
});

// ---------------------------------------------------------------------------
// P3#4: suiteStatus treats all-passed-with-skipped as 'passed'
// ---------------------------------------------------------------------------
test('suiteStatus: passed with skipped tests => passed', () => {
  assert.equal(h.suiteStatus({ total: 12, passed: 10, failed: 0, broken: 0, skipped: 2, unknown: 0 }), 'passed');
});
test('suiteStatus: all-skipped stays flaky (not passed, not empty)', () => {
  assert.equal(h.suiteStatus({ total: 3, passed: 0, failed: 0, broken: 0, skipped: 3, unknown: 0 }), 'flaky');
});

// ---------------------------------------------------------------------------
// P2#1: failure details are threaded explicitly so they survive buildRefMetadata
// ---------------------------------------------------------------------------
test('buildRefMetadata: drops transient _failures from persisted suite entries', () => {
  const ref = h.buildRefMetadata({
    slug: 'pr-1', displayName: 'PR #1', source: makeSource(),
    suites: {
      unit: { availability: 'generated', status: 'passed', stats: { total: 1, passed: 1 }, _failures: [{ name: 'x', message: 'm' }] },
      regular: { availability: 'generated', status: 'failed', stats: { total: 1, failed: 1 }, _failures: [{ name: 'y', message: 'n' }] },
      quarantine: { availability: 'generated', _failures: [{ name: 'z', message: 'q' }] },
    },
  });
  assert.equal(ref.suites.unit._failures, undefined);
  assert.equal(ref.suites.regular._failures, undefined);
  assert.equal(ref.suites.quarantine._failures, undefined);
});

test('collectCommentFailures: reads transient _failures from a suitesMeta-shaped object', () => {
  const suitesMeta = {
    unit: { availability: 'generated', _failures: h.extractFailures([failedResult]) },
    regular: { availability: 'generated', _failures: h.extractFailures([failedResult]) },
    quarantine: { availability: 'generated', _failures: [] },
  };
  const failures = h.collectCommentFailures({ suites: suitesMeta });
  assert.equal(failures.length, 2);
  assert.match(failures[0].message, /expected status code 400 but was 200/);
});

test('renderPrComment: failure block renders when failures threaded explicitly (integration)', () => {
  // Mirrors report-prepare.mjs: buildRefMetadata drops _failures, so the
  // orchestrator collects them from suitesMeta and passes them in explicitly.
  const suitesMeta = {
    unit: { availability: 'generated', status: 'passed', stats: { total: 4, passed: 3, failed: 1 }, _failures: h.extractFailures([failedResult]) },
    regular: { availability: 'generated', status: 'failed', stats: { total: 4, passed: 3, failed: 1 }, _failures: h.extractFailures([failedResult]) },
    quarantine: { availability: 'generated', _failures: [] },
  };
  const ref = h.buildRefMetadata({ slug: 'pr-123', displayName: 'PR #123', source: makeSource({ conclusion: 'failure' }), suites: suitesMeta });
  assert.equal(ref.suites.regular._failures, undefined);
  const failures = h.collectCommentFailures({ suites: suitesMeta });
  const body = h.renderPrComment(ref, { pagesDeployOk: true, failures });
  assert.match(body, /Regular\/unit failures/);
  assert.match(body, /expected status code 400 but was 200/);
});

test('renderPrComment: empty failures option yields no failure block', () => {
  const ref = makeRef('pr-1');
  const body = h.renderPrComment(ref, { pagesDeployOk: true, failures: [] });
  assert.ok(!/Regular\/unit failures/.test(body));
});
