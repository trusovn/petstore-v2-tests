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

Jetty access logs are written to `target/petstore-logs/access/` by default.
Application output remains available through:

```bash
make logs
```

## Configuration

- `PETSTORE_PORT` changes the host port used by Compose and the scripts.
- `PETSTORE_BASE_URI` explicitly overrides the base URI used by scripts and
  tests.
- `PETSTORE_ACCESS_LOG_DIR` changes the host directory mounted at `/var/log`.
- `-Dpetstore.baseUri=...` overrides the test base URI and takes precedence over
  `PETSTORE_BASE_URI`.
- `PETSTORE_API_KEY` is the api_key sent in the `api_key` header by the
  contract tests. It is required for `make verify`; the config loader fails
  fast if it is unset or blank. The local pinned image accepts the Swagger
  Petstore default api_key.

The Java configuration precedence is JVM property, environment variable, then
`src/test/resources/application.config.yaml`. The api_key is declared in
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
PETSTORE_BASE_URI=https://petstore.swagger.io/v2 make verify
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
