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

Tests are currently sketches for a future full suite. They use the local URI by
default and can be run separately with `make test`.

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

The Java configuration precedence is JVM property, environment variable, then
`src/test/resources/application.config.yaml`.

Running tests against the shared public service is an explicit opt-in:

```bash
PETSTORE_BASE_URI=https://petstore.swagger.io/v2 mvn test
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
