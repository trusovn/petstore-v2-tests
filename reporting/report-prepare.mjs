#!/usr/bin/env node
// CI report preparation orchestrator. Runs in the read-only `prepare` job.
//
// Reads GitHub context + downloaded artifact + fetched existing state from
// environment variables, classifies suites, generates Allure reports, builds
// ref metadata / manifest / landing page / PR comment / offline bundle, and
// writes a prepared state tree and Pages tree to output directories. Emits
// job outputs (decision, needs-pages, needs-comment, slug, pr-number, etc.)
// to GITHUB_OUTPUT and a comment body to a file.
//
// Never sources, imports, or executes files from the downloaded artifact; it
// only reads result JSON and invokes the trusted report-generate helper.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync, statSync, appendFileSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir as osTmpdir } from 'node:os';

import * as h from './report-site.mjs';
import { generateReport } from './report-generate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function requireAbsolute(name) {
  const v = requireEnv(name);
  if (!isAbsolute(v)) throw new Error(`${name} must be an absolute path: ${v}`);
  return v;
}

const RESULT_RE = /-result\.json$/;

function loadJsonIfExists(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return null;
  }
}

function listRefs(stateDir) {
  const dir = join(stateDir, 'refs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => loadJsonIfExists(join(dir, f)))
    .filter(Boolean);
}

function writeRef(stateDir, ref) {
  const dir = join(stateDir, 'refs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${ref.slug}.json`), JSON.stringify(ref, null, 2) + '\n');
}

function removeRef(stateDir, slug) {
  rmSync(join(stateDir, 'refs', `${slug}.json`), { force: true });
  rmSync(join(stateDir, 'history', slug), { recursive: true, force: true });
}

function classifySuites(artifactDir) {
  const out = {};
  if (!artifactDir || !existsSync(artifactDir)) {
    // Entire artifact absent/unusable.
    for (const s of h.SUITES) out[s] = 'missing';
    return { suites: out, artifactAvailable: false };
  }
  for (const s of h.SUITES) {
    const dir = join(artifactDir, s);
    let hasResults = false;
    if (existsSync(dir)) {
      hasResults = readdirSync(dir).some((f) => RESULT_RE.test(f));
    }
    // dir absent or empty => not-run (a gating step stopped before this suite)
    out[s] = hasResults ? 'generated' : 'not-run';
  }
  return { suites: out, artifactAvailable: true };
}

function loadResultFiles(artifactDir, suite) {
  const dir = join(artifactDir, suite);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => RESULT_RE.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

function buildSource() {
  return {
    runId: Number(env('SOURCE_RUN_ID', 0)) || 0,
    runNumber: Number(env('SOURCE_RUN_NUMBER', 0)) || 0,
    runAttempt: Number(env('SOURCE_RUN_ATTEMPT', 1)) || 1,
    headSha: env('SOURCE_HEAD_SHA', ''),
    event: env('SOURCE_EVENT', ''),
    conclusion: env('SOURCE_CONCLUSION', ''),
    url: env('SOURCE_RUN_URL', ''),
    completedAt: env('SOURCE_COMPLETED_AT', ''),
    prNumber: Number(env('PR_NUMBER', 0)) || null,
  };
}

function appendGithubOutput(obj) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  let chunk = '';
  for (const [k, v] of Object.entries(obj)) {
    chunk += `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}\n`;
  }
  appendFileSync(file, chunk);
}

function buildSuitesMeta(artifactDir, suitesAvailability) {
  const out = {};
  for (const s of h.SUITES) {
    const av = suitesAvailability[s];
    if (s === 'quarantine') {
      out[s] = { availability: av };
    } else {
      if (av === 'generated') {
        const files = loadResultFiles(artifactDir, s);
        const stats = h.computeSuiteStats(files);
        const failures = h.extractFailures(files);
        out[s] = { availability: 'generated', status: h.suiteStatus(stats), stats, _failures: failures };
      } else {
        out[s] = { availability: av };
      }
    }
  }
  return out;
}

async function generatePagesReports({ slug, suitesMeta, artifactDir, outPagesDir, outStateDir, existingStateDir, source }) {
  for (const s of h.SUITES) {
    const meta = suitesMeta[s];
    if (meta.availability !== 'generated') continue;
    const resultsDir = join(artifactDir, s);
    const reportOut = join(outPagesDir, 'reports', slug, s);
    // History: copy existing JSONL to the output state dir first, then let Allure read+append.
    const histOut = join(outStateDir, 'history', slug, `${s}.jsonl`);
    const histExisting = join(existingStateDir, 'history', slug, `${s}.jsonl`);
    mkdirSync(join(outStateDir, 'history', slug), { recursive: true });
    if (existsSync(histExisting)) cpSync(histExisting, histOut);
    generateReport({
      resultsDir,
      outputDir: reportOut,
      reportName: s,
      mode: 'pages',
      historyPath: histOut,
      historyLimit: Number(env('ALLURE_HISTORY_LIMIT', '20')),
      runUrl: source.url,
      runNumber: source.runNumber,
      allureBin: env('ALLURE_BIN') || join(__dirname, 'node_modules', '.bin', 'allure'),
      configPath: join(__dirname, 'allurerc.mjs'),
      workRoot: env('WORK_ROOT') || resolve(osTmpdir(), 'allure-ci-work'),
    });
    // Trim history to the limit defensively.
    trimHistory(histOut, Number(env('ALLURE_HISTORY_LIMIT', '20')));
  }
}

function trimHistory(path, limit) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  if (lines.length > limit) {
    writeFileSync(path, lines.slice(-limit).join('\n') + '\n');
  }
}

async function buildOfflineBundle({ suitesMeta, artifactDir, outOfflineDir, source }) {
  mkdirSync(outOfflineDir, { recursive: true });
  const availability = {};
  for (const s of h.SUITES) {
    const meta = suitesMeta[s];
    availability[s] = meta.availability;
    if (meta.availability !== 'generated') continue;
    const reportOut = join(outOfflineDir, s);
    generateReport({
      resultsDir: join(artifactDir, s),
      outputDir: reportOut,
      reportName: s,
      mode: 'offline',
      runUrl: source.url,
      runNumber: source.runNumber,
      allureBin: env('ALLURE_BIN') || join(__dirname, 'node_modules', '.bin', 'allure'),
      configPath: join(__dirname, 'allurerc.mjs'),
      workRoot: env('WORK_ROOT') || resolve(osTmpdir(), 'allure-ci-work'),
    });
  }
  writeFileSync(join(outOfflineDir, 'index.html'), h.renderOfflineRootIndex(availability));
  writeFileSync(join(outOfflineDir, 'README.txt'),
    'Petstore CI report (offline bundle)\n\nUnzip this artifact and open index.html in a browser.\n' +
    'Each suite directory has its own standalone index.html.\n');
}

async function main() {
  const reportEvent = env('REPORT_EVENT'); // workflow_run | pull_request | schedule
  const outStateDir = requireAbsolute('OUT_STATE_DIR');
  const outPagesDir = requireAbsolute('OUT_PAGES_DIR');
  const existingStateDir = env('EXISTING_STATE_DIR', join(outStateDir, '_existing'));
  const existingPagesDir = env('EXISTING_PAGES_DIR');
  const githubRepo = requireEnv('GITHUB_REPOSITORY');
  const output = {};

  mkdirSync(outStateDir, { recursive: true });
  mkdirSync(outPagesDir, { recursive: true });

  const existingRefs = listRefs(existingStateDir);

  if (reportEvent === 'workflow_run') {
    // Validate the source run.
    h.validateSourceRun({
      event: env('SOURCE_EVENT'),
      headRepositoryFullName: env('SOURCE_HEAD_REPO_FULL'),
      githubRepository: githubRepo,
      headBranch: env('SOURCE_HEAD_BRANCH'),
      conclusion: env('SOURCE_CONCLUSION'),
    });
    const sourceEvent = env('SOURCE_EVENT');
    const isManual = sourceEvent === 'workflow_dispatch';

    // Resolve PR number + slug. Manual dispatch has no durable Pages slug; it is
    // routed to the offline-bundle path and skips slug resolution entirely.
    let prNumber = null;
    let slug = '';
    if (!isManual) {
      if (sourceEvent === 'pull_request') {
        const prs = loadJsonIfExists(env('PR_NUMBERS_FILE')) || [];
        prNumber = h.resolvePrNumber({ pullRequests: prs, prNumber: env('PR_NUMBER') });
      }
      slug = h.resolveSlug({ event: sourceEvent, prNumber, headBranch: env('SOURCE_HEAD_BRANCH') });
    }
    const displayName = slug === 'main' ? 'main' : prNumber ? `PR #${prNumber}` : 'manual';
    const source = buildSource();
    if (prNumber) source.prNumber = prNumber;

    output.slug = slug;
    output.prNumber = prNumber || '';

    // Ordering vs. stored metadata.
    const stored = existingRefs.find((r) => r.slug === slug) || null;
    const decision = h.decidePublication(stored, source);
    output.decision = decision;

    if (decision === 'skip-older') {
      output.needsPages = 'false';
      output.needsComment = 'false';
      output.needsDeploy = 'false';
      output.summary = `Skipped: source run ${source.runNumber}.${source.runAttempt} is older than stored ${stored.source.runNumber}.${stored.source.runAttempt}.`;
      appendGithubOutput(output);
      console.log(output.summary);
      return;
    }

    if (decision === 'idempotent') {
      // Reuse stored report and history; nothing changes. The comment from this
      // run already exists, so do not rewrite it.
      output.needsPages = 'false';
      output.needsComment = 'false';
      output.needsDeploy = 'false';
      output.summary = `Idempotent: source run ${source.runNumber}.${source.runAttempt} already published.`;
      appendGithubOutput(output);
      console.log(output.summary);
      return;
    }

    const artifactDir = env('ALLURE_ARTIFACT_DIR');
    const { suites: availability, artifactAvailable } = classifySuites(artifactDir);
    const suitesMeta = buildSuitesMeta(artifactDir, availability);

    const ref = h.buildRefMetadata({ slug, displayName, source, suites: suitesMeta });

    if (isManual) {
      // Offline bundle only; do not mutate Pages state.
      const outOfflineDir = requireAbsolute('OUT_OFFLINE_DIR');
      await buildOfflineBundle({ suitesMeta, artifactDir, outOfflineDir, source });
      output.needsPages = 'false';
      output.needsComment = 'false';
      output.needsDeploy = 'false';
      output.offlineBundleDir = outOfflineDir;
      output.summary = `Offline bundle generated at ${outOfflineDir}`;
      appendGithubOutput(output);
      console.log(output.summary);
      return;
    }

    // Pages path: generate reports + write state for this slug.
    copyExistingReports(existingPagesDir, outPagesDir);
    rmSync(join(outPagesDir, 'reports', slug), { recursive: true, force: true });
    copyExistingHistory(existingStateDir, outStateDir);
    await generatePagesReports({ slug, suitesMeta, artifactDir, outPagesDir, outStateDir, existingStateDir, source });
    // Merge ref into existing refs and write all back.
    const merged = [...existingRefs.filter((r) => r.slug !== slug), ref];
    for (const r of merged) writeRef(outStateDir, r);
    // Render manifest + landing page (with all refs).
    writeSite(outPagesDir, merged);

    output.needsPages = 'true';
    output.needsComment = sourceEvent === 'pull_request' ? 'true' : 'false';
    output.needsDeploy = 'true';
    if (sourceEvent === 'pull_request') {
      // Failures are transient: buildRefMetadata intentionally drops _failures
      // from the persisted ref, so collect them from suitesMeta and thread them
      // into the comment explicitly rather than reading them off the ref.
      const failures = h.collectCommentFailures({ suites: suitesMeta });
      const body = h.renderPrComment(ref, { pagesDeployOk: true, failures });
      h.validatePrCommentLength(body);
      const commentFile = env('COMMENT_BODY_FILE');
      if (commentFile) writeFileSync(commentFile, h.wrapCommentBody(body));
      output.commentBodyFile = commentFile || '';
    }
    output.summary = `Published ${slug} (decision=${decision}, suites=${JSON.stringify(availability)})`;
    appendGithubOutput(output);
    console.log(output.summary);
    return;
  }

  if (reportEvent === 'pull_request') {
    const action = env('PR_ACTION'); // closed | reopened
    const prNumber = Number(env('PR_NUMBER'));
    const slug = h.resolveSlug({ event: 'pull_request', prNumber });
    const stored = existingRefs.find((r) => r.slug === slug);
    if (!stored) {
      output.needsPages = 'false';
      output.summary = `pull_request ${action}: no stored ref for ${slug}; nothing to update.`;
      appendGithubOutput(output);
      console.log(output.summary);
      return;
    }
    let ref;
    if (action === 'closed') {
      ref = h.markClosed(stored, env('PR_CLOSED_AT') || new Date().toISOString());
    } else if (action === 'reopened') {
      ref = h.markReopened(stored);
    } else {
      throw new Error(`Unsupported PR action: ${action}`);
    }
    const merged = [...existingRefs.filter((r) => r.slug !== slug), ref];
    for (const r of merged) writeRef(outStateDir, r);
    copyExistingReports(existingPagesDir, outPagesDir);
    copyExistingHistory(existingStateDir, outStateDir);
    writeSite(outPagesDir, merged);
    output.slug = slug;
    output.needsPages = 'true';
    output.needsDeploy = 'true';
    output.needsComment = 'false';
    output.summary = `PR ${action}: updated ${slug}`;
    appendGithubOutput(output);
    console.log(output.summary);
    return;
  }

  if (reportEvent === 'schedule') {
    const now = env('CLEANUP_NOW') || new Date().toISOString();
    const { expired, retained } = h.partitionForCleanup(existingRefs, now);
    for (const slug of expired) {
      removeRef(outStateDir, slug);
    }
    for (const r of retained) writeRef(outStateDir, r);
    copyExistingHistory(existingStateDir, outStateDir);
    // copyExistingHistory bulk-copies the entire existing history tree, which
    // re-introduces history for the expired slugs just removed by removeRef.
    // Prune it again so removed PRs leave no orphaned state.
    for (const slug of expired) {
      rmSync(join(outStateDir, 'history', slug), { recursive: true, force: true });
    }
    const changed = expired.length > 0;
    if (changed) {
      copyExistingReports(existingPagesDir, outPagesDir);
      for (const slug of expired) {
        rmSync(join(outPagesDir, 'reports', slug), { recursive: true, force: true });
      }
      writeSite(outPagesDir, retained);
    }
    output.needsPages = changed ? 'true' : 'false';
    output.needsDeploy = changed ? 'true' : 'false';
    output.needsComment = 'false';
    output.expired = JSON.stringify(expired);
    output.summary = `Cleanup: removed ${expired.length} expired PR(s)${changed ? '' : '; snapshot unchanged'}.`;
    appendGithubOutput(output);
    console.log(output.summary);
    return;
  }

  throw new Error(`Unknown REPORT_EVENT: ${reportEvent}`);
}

function copyExistingHistory(existingStateDir, outStateDir) {
  const src = join(existingStateDir, 'history');
  if (!existsSync(src)) return;
  const dst = join(outStateDir, 'history');
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

function copyExistingReports(existingPagesDir, outPagesDir) {
  if (!existingPagesDir) return;
  const src = join(existingPagesDir, 'reports');
  if (!existsSync(src)) return;
  const dst = join(outPagesDir, 'reports');
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

function writeSite(outPagesDir, refs) {
  writeFileSync(join(outPagesDir, 'index.html'), h.renderLandingPage(refs));
  const manifest = h.buildManifest(refs);
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(join(outPagesDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

main().catch((e) => {
  console.error('report-prepare failed:', e.stack || e.message || e);
  process.exit(1);
});
