#!/usr/bin/env node
// Allure 3 report generation orchestrator for CI.
//
// Invoked once per (ref, suite) by the report workflow. Validates inputs from
// environment variables, copies the trusted results into a preparation
// directory below RUNNER_TEMP, writes a trusted executor.json, and runs
// `allure awesome` with a pinned config and bounded CLI flags. Validates the
// generated report before returning.
//
// This script never sources, imports, or executes files from the downloaded
// artifact; it only copies result JSON and writes trusted metadata.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const SUITE_RESULT_GLOB = /-result\.json$/;

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function requireAbsoluteEnv(name) {
  const v = requireEnv(name);
  if (!isAbsolute(v)) throw new Error(`${name} must be an absolute path: ${v}`);
  return v;
}

function listResultFiles(dir) {
  return readdirSync(dir).filter((f) => SUITE_RESULT_GLOB.test(f));
}

function buildExecutor({ runUrl, runNumber, reportName }) {
  return {
    name: 'GitHub Actions',
    type: 'github',
    reportName,
    buildUrl: runUrl,
    reportUrl: runUrl, // old full HTML reports are not archived; point at the run
    buildName: String(runNumber ?? ''),
  };
}

function resolveAllureBin() {
  const explicit = env('ALLURE_BIN');
  if (explicit) return explicit;
  // Default to the npm-installed binary in this package.
  const local = join(__dirname, 'node_modules', '.bin', 'allure');
  return local;
}

function runAllure({ bin, args, cwd }) {
  const res = spawnSync(bin, args, { cwd, stdio: 'inherit' });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`allure exited with ${res.status}`);
}

function validateReport(outDir, singleFile) {
  if (!existsSync(outDir)) throw new Error(`Report output missing: ${outDir}`);
  const indexPath = join(outDir, 'index.html');
  if (!existsSync(indexPath)) throw new Error(`Report missing index.html: ${outDir}`);
  const summaryPath = join(outDir, 'summary.json');
  if (!existsSync(summaryPath)) throw new Error(`Report missing summary.json: ${outDir}`);
  if (!singleFile) {
    // Multi-file reports carry report-data directories; just assert the tree is non-trivial.
    const entries = readdirSync(outDir);
    if (entries.length < 3) {
      throw new Error(`Multi-file report looks empty (${entries.length} entries): ${outDir}`);
    }
  }
}

export function generateReport(options) {
  const {
    resultsDir,
    outputDir,
    reportName,
    mode, // 'pages' | 'offline'
    historyPath,
    historyLimit,
    runUrl,
    runNumber,
    allureBin,
    configPath,
    workRoot,
  } = options;

  if (!resultsDir || !existsSync(resultsDir)) {
    throw new Error(`resultsDir does not exist: ${resultsDir}`);
  }
  const resultFiles = listResultFiles(resultsDir);
  if (resultFiles.length === 0) {
    throw new Error(`No *-result.json found in ${resultsDir}; refusing to generate an empty report`);
  }
  if (!isAbsolute(outputDir)) throw new Error(`outputDir must be absolute: ${outputDir}`);

  const singleFile = mode === 'offline';

  // Copy results into a trusted preparation directory and write executor.json.
  const prepDir = join(workRoot, `prep-${reportName}`);
  if (existsSync(prepDir)) rmrf(prepDir);
  mkdirSync(prepDir, { recursive: true });
  cpSync(resultsDir, prepDir, { recursive: true });
  writeFileSync(
    join(prepDir, 'executor.json'),
    JSON.stringify(buildExecutor({ runUrl, runNumber, reportName }), null, 2),
  );

  mkdirSync(outputDir, { recursive: true });

  const args = ['awesome', '--config', configPath, '--output', outputDir, '--report-name', reportName, '--report-language', 'en'];
  if (singleFile) args.push('--single-file');
  if (historyPath && mode === 'pages') {
    args.push('--history-path', historyPath);
  }
  args.push(prepDir);

  runAllure({ bin: allureBin, args, cwd: workRoot });
  validateReport(outputDir, singleFile);
  return { outputDir, singleFile, resultCount: resultFiles.length };
}

function rmrf(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function main() {
  const resultsDir = requireAbsoluteEnv('ALLURE_RESULTS_DIR');
  const outputDir = requireAbsoluteEnv('ALLURE_OUTPUT_DIR');
  const reportName = requireEnv('ALLURE_REPORT_NAME');
  const mode = env('ALLURE_MODE', 'pages');
  if (mode !== 'pages' && mode !== 'offline') {
    throw new Error(`ALLURE_MODE must be 'pages' or 'offline', got: ${mode}`);
  }
  const historyPath = env('ALLURE_HISTORY_PATH');
  const historyLimit = Number(env('ALLURE_HISTORY_LIMIT', '20'));
  const runUrl = env('ALLURE_RUN_URL', '');
  const runNumber = env('ALLURE_RUN_NUMBER', '');
  const allureBin = resolveAllureBin();
  const configPath = join(__dirname, 'allurerc.mjs');
  const workRoot = resolve(tmpdir(), 'allure-ci-work');
  mkdirSync(workRoot, { recursive: true });

  const result = generateReport({
    resultsDir, outputDir, reportName, mode, historyPath, historyLimit,
    runUrl, runNumber, allureBin, configPath, workRoot,
  });
  console.log(`Generated ${mode} report for ${reportName}: ${result.outputDir} (${result.resultCount} results, singleFile=${result.singleFile})`);
}

// Run only when executed directly.
const isMain = resolve(process.argv[1] || '') === __filename;
if (isMain) {
  main();
}
