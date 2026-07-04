// CI test reporting helpers for petstore-v2-tests.
//
// Pure logic for slug resolution, source-run validation, ordering/idempotency,
// suite availability, ref metadata, landing page + manifest rendering, PR
// comment rendering, offline bundle root, lifecycle (close/reopen/expire),
// scheduled cleanup, security guards (symlink/size), escaping, mention
// neutralization, and failure-list truncation.
//
// All functions are pure and deterministic (except Date parsing). No network,
// no filesystem, no Allure invocation. The workflow jobs compose these helpers
// with I/O; tests cover the helpers directly.

export const SUITES = ['unit', 'regular', 'quarantine'];
export const PUBLIC_SUITES = ['unit', 'regular']; // stats-bearing suites
export const MARKER = '<!-- petstore-ci-report -->';
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const HISTORY_LIMIT = 20;
export const PAGES_BASE_URL = 'https://trusovn.github.io/petstore-v2-tests/';
export const REPO_FULL_NAME = 'trusovn/petstore-v2-tests';

export const LIMITS = Object.freeze({
  extractedArtifactBytes: 100 * 1024 * 1024,
  generatedStateTreeBytes: 250 * 1024 * 1024,
  prCommentChars: 50_000,
  maxFailuresInComment: 10,
  failureMessageChars: 300,
});

export const ACCEPTED_SOURCE_EVENTS = ['pull_request', 'push', 'workflow_dispatch'];

// ---------------------------------------------------------------------------
// Slug resolution and source-run validation
// ---------------------------------------------------------------------------

/**
 * Resolve the durable ref slug for a source run.
 * - push (main) and workflow_dispatch-on-main source events resolve to "main".
 * - pull_request resolves to "pr-<number>".
 * Throws on unresolvable input.
 */
export function resolveSlug({ event, prNumber, headBranch }) {
  if (event === 'push') {
    if (headBranch !== 'main') {
      throw new Error(`Push slug requires headBranch "main", got "${headBranch}"`);
    }
    return 'main';
  }
  if (event === 'workflow_dispatch') {
    // workflow_dispatch has no durable slug; caller must route to offline path.
    // If a slug is requested it is the dispatch branch; only main is durable.
    if (headBranch === 'main') return 'main';
    throw new Error('workflow_dispatch does not map to a durable Pages slug');
  }
  if (event === 'pull_request') {
    const n = Number(prNumber);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid PR number for slug: ${JSON.stringify(prNumber)}`);
    }
    return `pr-${n}`;
  }
  throw new Error(`Cannot resolve slug for event "${event}"`);
}

/**
 * Validate a workflow_run source run before any artifact is downloaded.
 * Throws on disallowed events, foreign head repositories, or push not on main.
 */
export function validateSourceRun({
  event,
  headRepositoryFullName,
  githubRepository,
  headBranch,
  conclusion,
}) {
  if (!ACCEPTED_SOURCE_EVENTS.includes(event)) {
    throw new Error(`Rejected source event: ${event}`);
  }
  if (conclusion === 'cancelled') {
    throw new Error('Cancelled source runs are skipped');
  }
  if (headRepositoryFullName && headRepositoryFullName !== githubRepository) {
    throw new Error(
      `Foreign head repository rejected: ${headRepositoryFullName} != ${githubRepository}`,
    );
  }
  if (event === 'push' && headBranch !== 'main') {
    throw new Error(`Push source runs must target main, got "${headBranch}"`);
  }
}

/**
 * Resolve a PR number from the workflow_run metadata, requiring an unambiguous
 * association. `pullRequests` is the workflow_run `pull_requests` array.
 * Falls back to a single explicit `prNumber`. Throws on ambiguous/missing data.
 */
export function resolvePrNumber({ pullRequests, prNumber }) {
  if (Array.isArray(pullRequests) && pullRequests.length === 1) {
    return pullRequests[0].number;
  }
  if (Array.isArray(pullRequests) && pullRequests.length > 1) {
    throw new Error(`Ambiguous PR association: ${pullRequests.length} PRs`);
  }
  if (Array.isArray(pullRequests) && pullRequests.length === 0 && prNumber != null) {
    const n = Number(prNumber);
    if (Number.isInteger(n) && n > 0) return n;
  }
  throw new Error('Could not resolve a single PR number');
}

// ---------------------------------------------------------------------------
// Ordering and idempotency
// ---------------------------------------------------------------------------

/**
 * Compare two run descriptors. Returns >0 if `incoming` is newer, <0 if older,
 * 0 if identical (same runNumber and runAttempt).
 */
export function compareRuns(incoming, stored) {
  const a = Number(incoming.runNumber);
  const b = Number(stored.runNumber);
  if (a !== b) return a - b;
  return Number(incoming.runAttempt) - Number(stored.runAttempt);
}

/**
 * Decide whether to publish, skip as older, or reuse as idempotent.
 * `stored` is the existing ref metadata (or null). `incoming` is the new run.
 */
export function decidePublication(stored, incoming) {
  if (!stored) return 'publish';
  const c = compareRuns(incoming, stored.source);
  if (c < 0) return 'skip-older';
  if (c === 0) return 'idempotent';
  return 'publish';
}

// ---------------------------------------------------------------------------
// Suite availability and stats
// ---------------------------------------------------------------------------

/**
 * Classify a suite's availability.
 * - generated: reached and produced at least one result file.
 * - missing:   reached but no usable results (artifact absent/corrupt).
 * - not-run:   not reached (a gating step stopped the workflow first).
 */
export function classifySuite({ reached, hasResults }) {
  if (hasResults) return 'generated';
  if (reached) return 'missing';
  return 'not-run';
}

/**
 * Compute aggregate stats from parsed Allure result objects.
 */
export function computeSuiteStats(resultFiles) {
  let total = 0, passed = 0, failed = 0, broken = 0, skipped = 0, unknown = 0;
  for (const r of resultFiles) {
    total++;
    switch (r.status) {
      case 'passed': passed++; break;
      case 'failed': failed++; break;
      case 'broken': broken++; break;
      case 'skipped': skipped++; break;
      default: unknown++;
    }
  }
  return { total, passed, failed, broken, skipped, unknown };
}

/**
 * Derive a coarse suite status from stats: failed/broken -> "failed",
 * all passed -> "passed", empty -> "empty", otherwise "flaky".
 */
export function suiteStatus(stats) {
  if (stats.failed > 0 || stats.broken > 0) return 'failed';
  if (stats.total > 0 && stats.passed + stats.skipped === stats.total && stats.passed > 0) return 'passed';
  if (stats.total === 0) return 'empty';
  return 'flaky';
}

/**
 * Extract failed/broken results for the PR comment, excluding trace.
 */
export function extractFailures(resultFiles) {
  return resultFiles
    .filter((r) => r.status === 'failed' || r.status === 'broken')
    .map((r) => ({
      name: r.fullName || r.name || r.testCaseName || '(unknown)',
      message: (r.statusDetails && r.statusDetails.message) || '',
    }));
}

/**
 * Truncate a failure list to at most `maxCount` entries, taking the first
 * non-empty line of each message and capping at `maxLen` characters.
 */
export function truncateFailureList(failures, { maxCount = LIMITS.maxFailuresInComment, maxLen = LIMITS.failureMessageChars } = {}) {
  return failures.slice(0, maxCount).map((f) => ({
    name: f.name,
    message: firstNonEmptyLine(f.message).slice(0, maxLen),
  }));
}

export function firstNonEmptyLine(msg) {
  if (!msg) return '';
  for (const line of String(msg).split(/\r?\n/)) {
    if (line.trim()) return line;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Ref metadata
// ---------------------------------------------------------------------------

/**
 * Build a ref metadata object (section 8.1 schema). Quarantine only stores
 * availability and reportPath; its status/stats are always null/empty.
 */
export function buildRefMetadata({ slug, displayName, source, suites }) {
  const ref = {
    schemaVersion: 1,
    slug,
    displayName,
    lifecycle: { state: 'open', closedAt: null, expiresAt: null },
    source,
    suites: {},
  };
  for (const suite of SUITES) {
    const s = suites[suite] || { availability: 'not-run' };
    const reportPath =
      s.availability === 'generated' ? `reports/${slug}/${suite}/` : null;
    if (suite === 'quarantine') {
      ref.suites.quarantine = {
        availability: s.availability,
        status: null,
        stats: {},
        reportPath,
      };
    } else {
      ref.suites[suite] = {
        availability: s.availability,
        status: s.availability === 'generated' ? s.status : null,
        stats: s.availability === 'generated' ? s.stats : {},
        reportPath,
      };
    }
  }
  return ref;
}

// ---------------------------------------------------------------------------
// Lifecycle (close / reopen / expire) and cleanup
// ---------------------------------------------------------------------------

export function markClosed(ref, closedAt) {
  const t = new Date(closedAt).getTime();
  if (Number.isNaN(t)) throw new Error(`Invalid closedAt: ${closedAt}`);
  return {
    ...ref,
    lifecycle: {
      state: 'closed',
      closedAt,
      expiresAt: new Date(t + SEVEN_DAYS_MS).toISOString(),
    },
  };
}

export function markReopened(ref) {
  return {
    ...ref,
    lifecycle: { state: 'open', closedAt: null, expiresAt: null },
  };
}

export function isExpired(ref, now) {
  if (ref.lifecycle.state !== 'closed') return false;
  if (!ref.lifecycle.expiresAt) return false;
  return new Date(ref.lifecycle.expiresAt).getTime() <= new Date(now).getTime();
}

/**
 * Partition refs into expired slugs (to remove) and retained refs.
 * Only closed refs whose explicit expiresAt is due are removed.
 */
export function partitionForCleanup(refs, now) {
  const expired = [];
  const retained = [];
  for (const r of refs) {
    if (r.lifecycle.state === 'closed' && isExpired(r, now)) {
      expired.push(r.slug);
    } else {
      retained.push(r);
    }
  }
  return { expired, retained };
}

// ---------------------------------------------------------------------------
// Sorting (manifest + landing page)
// ---------------------------------------------------------------------------

function refGroupOrder(r) {
  if (r.slug === 'main') return 0;
  if (r.lifecycle.state === 'open') return 1;
  return 2; // closed
}

/**
 * Sort refs for the manifest/landing page: main, then open PRs newest first,
 * then closed PRs newest first.
 */
export function sortRefs(refs) {
  return [...refs].sort((a, b) => {
    const ga = refGroupOrder(a);
    const gb = refGroupOrder(b);
    if (ga !== gb) return ga - gb;
    if (a.slug === 'main' || b.slug === 'main') return 0;
    return compareRuns(b.source, a.source); // newest first within group
  });
}

// ---------------------------------------------------------------------------
// Escaping and mention neutralization
// ---------------------------------------------------------------------------

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeMarkdown(s) {
  return String(s).replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, '\\$1');
}

/**
 * Neutralize @-mentions by inserting a zero-width space after each @ so GitHub
 * does not trigger notifications on test-derived text.
 */
export function neutralizeMentions(s) {
  return String(s).replace(/@/g, '@\u200b');
}

export function sanitizeForMarkdown(s) {
  return neutralizeMentions(escapeMarkdown(s));
}

export function sanitizeForHtml(s) {
  return escapeHtml(neutralizeMentions(String(s)));
}

// ---------------------------------------------------------------------------
// Landing page and manifest
// ---------------------------------------------------------------------------

function reportUrl(ref, suite) {
  return `${PAGES_BASE_URL}reports/${ref.slug}/${suite}/`;
}

function suiteCellHtml(ref, suite) {
  const s = ref.suites[suite];
  if (suite === 'quarantine') {
    if (s.availability === 'generated') {
      return `<a href="${reportUrl(ref, suite)}">non-gating; stats excluded</a>`;
    }
    if (s.availability === 'not-run') return 'not run';
    return 'unavailable';
  }
  if (s.availability === 'generated') {
    const st = s.status === 'passed' ? 'passed' : s.status === 'failed' ? 'failed' : s.status;
    const counts = formatCounts(s.stats);
    return `<a href="${reportUrl(ref, suite)}">${escapeHtml(`${counts} ${st}`)}</a>`;
  }
  if (s.availability === 'not-run') return 'not run';
  return 'unavailable';
}

function formatCounts(stats) {
  const parts = [];
  if (stats.passed) parts.push(`${stats.passed} passed`);
  if (stats.failed) parts.push(`${stats.failed} failed`);
  if (stats.broken) parts.push(`${stats.broken} broken`);
  if (stats.skipped) parts.push(`${stats.skipped} skipped`);
  if (stats.unknown) parts.push(`${stats.unknown} unknown`);
  return parts.join(', ');
}

/**
 * Render the static, escaped landing-page HTML. No quarantine counts/status;
 * quarantine shows only an availability-aware report link.
 */
export function renderLandingPage(refs) {
  const sorted = sortRefs(refs);
  const main = sorted.find((r) => r.slug === 'main');
  const open = sorted.filter((r) => r.slug !== 'main' && r.lifecycle.state === 'open');
  const closed = sorted.filter((r) => r.lifecycle.state === 'closed');

  const header =
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    `<title>${escapeHtml(REPO_FULL_NAME)} CI reports</title>\n` +
    '</head>\n<body>\n' +
    `<h1>${escapeHtml(REPO_FULL_NAME)} CI reports</h1>\n` +
    `<p><a href="https://github.com/${escapeHtml(REPO_FULL_NAME)}/actions">Actions</a></p>\n`;

  const tableHead =
    '<table>\n<thead><tr>' +
    '<th>Ref</th><th>Gate</th><th>Updated</th><th>Unit</th><th>Regular</th><th>Quarantine</th><th>Run</th>' +
    '</tr></thead>\n<tbody>\n';

  const mainRow = main ? renderRefRow(main) : '';
  let body = header + '<section><h2>main</h2>\n' + tableHead + mainRow + '</tbody></table></section>\n';
  if (open.length) {
    body += '<section><h2>Open pull requests</h2>\n' + tableHead + open.map(renderRefRow).join('\n') + '</tbody></table></section>\n';
  }
  if (closed.length) {
    body += '<section><h2>Recently closed</h2>\n' + tableHead + closed.map(renderRefRow).join('\n') + '</tbody></table></section>\n';
  }
  return body + '</body>\n</html>\n';
}

function renderRefRow(ref) {
  const gate = ref.source.conclusion === 'success' ? 'passed' : ref.source.conclusion === 'failure' ? 'failed' : ref.source.conclusion;
  const updated = ref.source.completedAt || '';
  const runLink = ref.source.url ? `<a href="${escapeHtml(ref.source.url)}">run</a>` : '';
  return (
    '<tr>' +
    `<td>${escapeHtml(ref.displayName)}</td>` +
    `<td>${escapeHtml(gate)}</td>` +
    `<td>${escapeHtml(updated)}</td>` +
    `<td>${suiteCellHtml(ref, 'unit')}</td>` +
    `<td>${suiteCellHtml(ref, 'regular')}</td>` +
    `<td>${suiteCellHtml(ref, 'quarantine')}</td>` +
    `<td>${runLink}</td>` +
    '</tr>'
  );
}

/**
 * Build the manifest JSON object (no quarantine counts/status).
 */
export function buildManifest(refs) {
  const sorted = sortRefs(refs);
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(), // workflow sets real time
    baseUrl: PAGES_BASE_URL,
    refs: sorted.map((ref) => ({
      slug: ref.slug,
      displayName: ref.displayName,
      lifecycle: ref.lifecycle,
      source: ref.source,
      suites: {
        unit: ref.suites.unit,
        regular: ref.suites.regular,
        quarantine: {
          availability: ref.suites.quarantine.availability,
          reportPath: ref.suites.quarantine.reportPath,
        },
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// PR comment
// ---------------------------------------------------------------------------

function suiteCommentRow(ref, suite, label) {
  const s = ref.suites[suite];
  const reportLabel = s.availability === 'generated' ? 'Open' : s.availability === 'not-run' ? 'not run' : 'unavailable';
  if (suite === 'quarantine') {
    const result = 'non-gating; stats excluded';
    const link = s.availability === 'generated' ? `[Open](${reportUrl(ref, suite)})` : reportLabel;
    return `| ${label} | ${result} | ${link} |`;
  }
  if (s.availability !== 'generated') {
    return `| ${label} | ${sanitizeForMarkdown(reportLabel)} | — |`;
  }
  const counts = formatCounts(s.stats);
  const status = s.status;
  const link = `[Open](${reportUrl(ref, suite)})`;
  return `| ${label} | ${sanitizeForMarkdown(`${counts}`)} (${sanitizeForMarkdown(status)}) | ${link} |`;
}

/**
 * Render the PR comment markdown body (without the marker). Escapes test-derived
 * text, neutralizes mentions, truncates failures, and excludes quarantine stats.
 * `pagesDeployOk=false` shows a deployment-failure notice.
 */
export function renderPrComment(ref, { pagesDeployOk = true, failures } = {}) {
  const s = ref.source;
  const gate = s.conclusion === 'success' ? 'passed' : s.conclusion === 'failure' ? 'failed' : s.conclusion;
  const sha = (s.headSha || '').slice(0, 7);
  const head = `## Petstore CI report — ${sanitizeForMarkdown(ref.displayName)} (${sha})`;
  const dash = PAGES_BASE_URL;
  const deployNote = pagesDeployOk ? '' : ' · Pages deployment failed; report may not be live yet';
  const gateLine = `CI gate: ${sanitizeForMarkdown(gate)} · [source run](${sanitizeForMarkdown(s.url || '')}) · [dashboard](${dash})${deployNote}`;

  const tableHeader = '| Suite | Result | Report |\n|---|---|---|';
  const rows = [
    suiteCommentRow(ref, 'unit', 'Unit'),
    suiteCommentRow(ref, 'regular', 'Regular'),
    suiteCommentRow(ref, 'quarantine', 'Quarantine'),
  ].join('\n');

  const failureList = failures != null ? failures : collectCommentFailures(ref);
  let block = '';
  if (failureList.length) {
    const lines = failureList.map(
      (f) => `- ${sanitizeForMarkdown(f.name)} — ${sanitizeForMarkdown(f.message)} — open in report`,
    );
    block = '\n\nRegular/unit failures\n' + lines.join('\n');
  }

  const notRunNote = renderNotRunNote(ref);

  let body = `${head}\n\n${gateLine}\n\n${tableHeader}\n${rows}`;
  if (notRunNote) body += `\n\n${notRunNote}`;
  if (block) body += block;
  return body;
}

export function collectCommentFailures(ref) {
  const all = [];
  for (const suite of PUBLIC_SUITES) {
    const s = ref.suites[suite];
    if (s.availability === 'generated' && Array.isArray(s._failures)) {
      all.push(...truncateFailureList(s._failures));
    }
  }
  return all;
}

function renderNotRunNote(ref) {
  const missing = SUITES.filter((suite) => {
    if (suite === 'quarantine') return false;
    const s = ref.suites[suite];
    return s.availability === 'not-run' || s.availability === 'missing';
  });
  if (!missing.length) return '';
  if (missing.some((m) => ref.suites[m].availability === 'not-run')) {
    return 'A gating step stopped before later suites ran. See the source run log.';
  }
  return 'One or more suites were expected to produce results but no usable artifact was available.';
}

export function wrapCommentBody(body) {
  return `${MARKER}\n${body}`;
}

// ---------------------------------------------------------------------------
// Offline manual-run bundle
// ---------------------------------------------------------------------------

/**
 * Render the offline root index.html with relative links to available suite
 * reports. Missing suites are labeled "not run".
 */
export function renderOfflineRootIndex(suitesAvailability) {
  const items = SUITES.map((suite) => {
    const av = suitesAvailability[suite];
    if (av === 'generated') {
      return `<li><a href="./${suite}/index.html">${escapeHtml(suite)}</a></li>`;
    }
    return `<li>${escapeHtml(suite)} — not run</li>`;
  }).join('\n');
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8">' +
    '<title>Petstore CI report (offline)</title></head>\n<body>\n' +
    '<h1>Petstore CI report (offline)</h1>\n' +
    '<p>This is a downloadable offline bundle. Open a suite report below.</p>\n' +
    `<ul>\n${items}\n</ul>\n</body>\n</html>\n`
  );
}

// ---------------------------------------------------------------------------
// Security guards (symlink / size)
// ---------------------------------------------------------------------------

/**
 * Validate a list of tree entries. Rejects symlinks and enforces a total size
 * cap. `entries` are objects of shape { path, type: 'file'|'dir'|'symlink', size }.
 * Returns total file bytes.
 */
export function validateTree(entries, { maxBytes = LIMITS.generatedStateTreeBytes } = {}) {
  let total = 0;
  for (const e of entries) {
    if (e.type === 'symlink') {
      throw new Error(`Symlink rejected: ${e.path}`);
    }
    if (e.type === 'file') {
      total += Number(e.size) || 0;
      if (total > maxBytes) {
        throw new Error(`Size limit exceeded: ${total} > ${maxBytes} bytes (${e.path})`);
      }
    }
  }
  return total;
}

export function validatePrCommentLength(body) {
  if (body.length > LIMITS.prCommentChars) {
    throw new Error(`PR comment too long: ${body.length} > ${LIMITS.prCommentChars}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Allure result-id deep link
// ---------------------------------------------------------------------------

const RESULT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Construct an Allure deep link only after validating the generated result id.
 * Returns null for invalid ids so callers can fall back to the suite root.
 */
export function buildDeepLink(suiteReportUrl, resultId) {
  if (!RESULT_ID_RE.test(String(resultId))) return null;
  return `${suiteReportUrl}#${resultId}`;
}
