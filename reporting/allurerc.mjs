// Allure 3 configuration for CI report generation.
//
// History is held in the config file because `historyPath` and `historyLimit`
// are accepted by the Allure 3 config schema across versions. Report name,
// single-file mode, and report language are passed as CLI flags by
// report-generate.mjs for cross-version compatibility (the 3.4.x config schema
// rejects reportName/singleFile/language, while 3.14.x accepts them).
//
// Paths are read from validated environment variables set per (ref, suite) by
// the report workflow. The config never reads from the downloaded artifact.

function requireAbsolute(name) {
  const v = process.env[name];
  if (!v) return undefined;
  if (!v.startsWith('/')) {
    throw new Error(`${name} must be an absolute path, got: ${v}`);
  }
  return v;
}

const historyLimit = Number(process.env.ALLURE_HISTORY_LIMIT || 20);
if (!Number.isFinite(historyLimit) || historyLimit <= 0) {
  throw new Error(`ALLURE_HISTORY_LIMIT must be a positive number, got: ${process.env.ALLURE_HISTORY_LIMIT}`);
}

// historyPath is set only for Pages (multi-file) generation; offline bundles
// carry no history input.
const historyPath = requireAbsolute('ALLURE_HISTORY_PATH');

const config = { historyLimit };
if (historyPath) config.historyPath = historyPath;

export default config;
