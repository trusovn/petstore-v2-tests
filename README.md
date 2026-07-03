# Local Swagger Petstore contract tests

This repository can run a pinned Swagger Petstore v2 container locally. Startup
recreates the in-memory server, waits for readiness, and seeds deterministic
fixtures through the public HTTP API.

## Prerequisites

- Docker with Docker Compose
- Make
- Java 25 or newer
- Maven
- `curl`

## Start and reset

```bash
make start
```

Reset the server to its image baseline and reapply the fixtures:

```bash
make reset
```

Both commands leave the server running at `http://localhost:8080/v2`. The reset
command recreates the container, which clears its in-memory state. Stop and
remove it explicitly:

```bash
make stop
```

Run local unit tests without a Petstore instance:

```bash
make test
```

Tests under `src/test/java/org/mtrusov/tests` target the SUT. Run only those
tests with:

```bash
make verify
```

## Test report

Each test run writes Allure results to `target/allure-results`. HTTP requests
and responses are included as report attachments.

Generate a fresh HTML report for the full suite:

```bash
mvn clean verify
make report
```

The single-file report entry point is
`target/site/allure-maven-plugin/index.html`. Report generation downloads its
runtime on first use, then reuses the local cache.

## Failure diagnostics

`make verify`, `make verify-regular`, and `make verify-quarantine` resolve the
runtime context once (see Configuration) and run through
`scripts/run-with-diagnostics.sh`, which passes the resolved base URI to Maven as
`-Dpetstore.baseUri=...`. On a build-gating failure (the regular suite;
quarantined failures do not fail the build) it writes a bundle to
`target/failure-diagnostics/<timestamp>-<pid>/` containing:

- `manifest.json` — compact machine-readable run manifest (run id, start/end,
  duration, Maven exit code, sanitized goal/suite selection, target type,
  diagnostics provider, effective base URI, git commit + dirty/staged indicators,
  Java/Maven versions, Compose identity, failed-test names/count, collection and
  integrity warnings)
- `maven-console.log` — the Maven transcript (ANSI stripped)
- `surefire-reports/` — current-run Surefire XML/text reports plus any
  `*.dump`/`*.dumpstream` files
- `allure-results/` — current-run Allure result/container JSON and attachments
- `docker-compose.log` — container logs windowed to the run (`--since`)
- `container-state.txt` — Compose status including exited containers, plus
  selected `docker inspect` fields (image, start time, exit code, OOM flag,
  restart count)
- `access-logs/` — only the Jetty access-log bytes appended during the run
- `collector-errors.log` — best-effort collection and attachment-integrity
  warnings

Current-run artifacts are selected by a run marker (files newer than the marker
created just before Maven starts), so stale results from previous runs are not
misattributed. For every Allure `*-result.json`, the collector verifies each
referenced attachment source exists and records any dangling references in the
manifest and `collector-errors.log`. Collection is best-effort: no collection
step (directory creation, copying, Docker calls, or manifest writing) may
replace Maven's exit code, which is always returned. Compose/container/access-log
diagnostics are collected only when `PETSTORE_DIAGNOSTICS_PROVIDER=compose`; they
are skipped for `external` targets. No `.env`, full environment, git diff, full
`docker inspect`, or container filesystem is recorded.

## Fixtures and test isolation

Committed JSON fixtures are under `test-data/pets/` and `test-data/orders/`.
They are seeded with these reserved IDs:

- Read-only pets: `2001-2002`
- Read-only orders: `1001-1002`
- Mutation tests: `9000-9999`
- Guaranteed-missing test ID: `1010101010`

The seeder can be rerun independently and is idempotent for the pinned Petstore
implementation:

```bash
make seed
```

## Logs

Jetty access logs are written to `.runtime/petstore-logs/access/` by default (gitignored).
Application output remains available through:

```bash
make logs
```

## Configuration

- `PETSTORE_TARGET` selects the runtime target (default `local-compose`):
  - `local-compose` — managed local Compose service. The base URI is derived
    from `PETSTORE_PORT` (default `8080`) and the fixed base path `/v2` (the
    Petstore v2 image serves `/v2`); Compose/container/access-log diagnostics
    are collected on failure. `make start`, `make reset`, and `make seed`
    require this target.
  - `external` — a user-supplied endpoint. `PETSTORE_BASE_URI` is required and
    repository-local SUT diagnostics are disabled.
- `PETSTORE_PORT` changes the host port used by Compose (local-compose only).
- `PETSTORE_BASE_URI` sets the endpoint for the `external` target. It is
  rejected under `local-compose` to avoid guessing ownership from an address;
  use `PETSTORE_PORT` or select `PETSTORE_TARGET=external`.
- `PETSTORE_ACCESS_LOG_DIR` changes the host directory mounted at `/var/log`
  (local-compose only).
- `PETSTORE_API_KEY` is the api_key sent in the `api_key` header by the
  contract tests. It is required for `make verify`; the config loader fails
  fast if it is unset or blank. The local pinned image accepts the Swagger
  Petstore default api_key.

The managed Make path (`make verify*`) resolves the target once in
`scripts/petstore-context.sh` and passes the resolved base URI to Maven as
`-Dpetstore.baseUri=...`, so the JVM-property override is set explicitly rather
than relying on the YAML fallback. The Java configuration precedence for direct
IDE/Maven runs remains JVM property, environment variable, then
`src/test/resources/application.config.yaml` (used only as a fallback when the
managed path is not used). The api_key is declared in
`src/test/resources/application.config.yaml` as the placeholder
`${PETSTORE_API_KEY}` and resolved from the environment, with a repo-root
`.env` file as a fallback (real environment takes precedence over `.env`).
There is no JVM-property override for the api_key.

### `.env` file

Secrets such as `PETSTORE_API_KEY` can be placed in a repo-root `.env` file,
which is gitignored. Copy the committed template and fill in the value:

```bash
cp .env.example .env
# then edit .env and set PETSTORE_API_KEY=...
```

`.env` is optional: an exported `PETSTORE_API_KEY` environment variable is
sufficient, and takes precedence over `.env`.

Running tests against the shared public service is an explicit opt-in:

```bash
PETSTORE_TARGET=external PETSTORE_BASE_URI=https://petstore.swagger.io/v2 make verify
```

Warning: the suite creates and deletes data. Using the public URI mutates shared
public state and is not suitable for normal development or automated runs.

## Troubleshooting

If port 8080 is already in use, select another host port for start and reset:

```bash
PETSTORE_PORT=18080 make start
PETSTORE_PORT=18080 make reset
```

If readiness times out, the startup script prints Compose status and recent
container logs. Inspect the complete log with:

```bash
make logs
```
