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

## Test execution model

`mvn test` runs only the non-SUT unit/infrastructure tests via Surefire.
`mvn verify` additionally runs the SUT contract tests under
`src/test/java/org/mtrusov/tests` via Failsafe, split into two executions:

- `regular-tests` — all tests except `@Quarantine`; gates the build (the
  Failsafe `verify` goal fails on any failure).
- `quarantine-tests` — only `@Quarantine`; runs but never gates the build
  (`testFailureIgnore=true`). It uses a separate Failsafe summary file so the
  regular `verify` goal cannot misattribute quarantine failures.

Each execution writes its own `target/failsafe-reports/{regular,quarantine}`
and `target/allure-results/{regular,quarantine}`.

`make verify`, `make verify-regular`, and `make verify-quarantine` are thin
wrappers around `mvn verify` (with the corresponding suite-skip flags). They do
not start or stop the SUT, and there is no local automatic diagnostic bundling:
Failsafe does not collect Docker logs or upload artifacts. Bring the server up
with `make start` first, and inspect a still-running container with `make logs`.
In CI, the pipeline owns the Compose lifecycle and evidence retention
(`target/failsafe-reports/**`, `target/allure-results/**`, Compose logs, and
container state on failure), and always tears the environment down regardless of
outcome.

The base URI is resolved by `ConfigLoader` with precedence JVM property
(`-Dpetstore.baseUri`), then environment variable (`PETSTORE_BASE_URI`), then
`src/test/resources/application.config.yaml` (default
`http://localhost:8080/v2`). The `make verify*` targets honor a non-default
`PETSTORE_PORT` by translating it to `-Dpetstore.baseUri`
(`http://localhost:${PETSTORE_PORT}/v2`); an explicit `PETSTORE_BASE_URI` takes
precedence and is read directly by `ConfigLoader`, so no `-D` is passed when it
is set.

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
    Petstore v2 image serves `/v2`). `make start`, `make reset`, and `make seed`
    require this target.
  - `external` — a user-supplied endpoint. `PETSTORE_BASE_URI` is required.
- `PETSTORE_PORT` changes the host port used by Compose (local-compose only).
  The `make verify*` targets target this port (default `8080`) unless
  `PETSTORE_BASE_URI` is set.
- `PETSTORE_BASE_URI` sets the endpoint for the `external` target. It is
  rejected by the local Compose start/seed path (`petstore-context.sh`) under
  `local-compose` to avoid guessing ownership from an address; use
  `PETSTORE_PORT` or select `PETSTORE_TARGET=external` there. The `make verify*`
  targets do not use that resolver: they accept `PETSTORE_BASE_URI` directly via
  `ConfigLoader`, and it takes precedence over `PETSTORE_PORT`.
- `PETSTORE_ACCESS_LOG_DIR` changes the host directory mounted at `/var/log`
  (local-compose only).
- `PETSTORE_API_KEY` is the api_key sent in the `api_key` header by the
  contract tests. It is required for `make verify`; the config loader fails
  fast if it is unset or blank. The local pinned image accepts the Swagger
  Petstore default api_key.

The `make verify*` targets are thin `mvn verify` wrappers. They pass
`-Dpetstore.baseUri` derived from `PETSTORE_PORT` unless `PETSTORE_BASE_URI` is
set, in which case no `-D` is passed and `ConfigLoader` reads the env var
directly. For direct IDE/Maven runs the same `ConfigLoader` precedence applies
(JVM property, environment variable, then `application.config.yaml`). The
api_key is declared in `src/test/resources/application.config.yaml` as the
placeholder `${PETSTORE_API_KEY}` and resolved from the environment, with a
repo-root `.env` file as a fallback (real environment takes precedence over
`.env`). There is no JVM-property override for the api_key.

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
