# Local Swagger Petstore contract tests

This repository contains Java 25 contract tests for the Store API in Swagger
Petstore v2. It runs against a pinned local `swaggerapi/petstore:1.0.7`
container, seeds deterministic fixtures through the public HTTP API, and splits
build-gating checks from known implementation deviations.

The suite deliberately separates the published Swagger definition, the behavior
of the pinned sample implementation, and stricter production-oriented
expectations. See [Store contract policy and known deviations](docs/contract-policy.md).

The official Store order endpoints also advertise XML responses. This suite
mostly focuses on the JSON contract, with one narrow XML demo test for
`GET /store/order/{orderId}`. Broader XML coverage is intentionally out of
scope. `GET /store/inventory` is JSON-only in the published definition, and
order creation consumes JSON.

## Quick start

Prerequisites:

- Docker with Docker Compose
- Make
- Java 25 or newer
- Maven
- `curl`
- `jq`

Create a local `.env` file for the API key used by the contract tests:

```bash
cp .env.example .env
# then set PETSTORE_API_KEY to the api_key accepted by your Petstore instance
```

For the pinned local container, the Swagger Petstore default api_key is
sufficient.

Start the local Petstore container, wait for readiness, and seed fixtures:

```bash
make start
```

Run the build-gating SUT contract tests:

```bash
make verify-regular
```

Run the local unit/infrastructure tests, which do not require a Petstore
instance:

```bash
make test
```

Stop the local container when finished:

```bash
make stop
```

## Common commands

| Command | Purpose |
|---|---|
| `make start` | Start the pinned local Petstore container and seed fixtures. |
| `make reset` | Recreate the container, clearing in-memory state, then seed fixtures. |
| `make seed` | Reapply committed fixtures to an already running local container. |
| `make stop` | Stop and remove the local Compose service. |
| `make status` | Show Compose service status. |
| `make logs` | Follow local Petstore container logs. |
| `make test` | Run non-SUT unit/infrastructure tests via Surefire. |
| `make test-scripts` | Run shell tests for the Petstore context scripts. |
| `make verify-regular` | Run build-gating SUT contract tests only. |
| `make verify-quarantine` | Run quarantined SUT probes without failing the build. |
| `make verify` | Run regular and quarantined SUT tests. Only regular failures gate. |
| `make report` | Generate the regular-suite Allure report from latest results. |
| `make report-unit` | Generate the unit-suite Allure report from latest results. |
| `make report-quarantine` | Generate the quarantine-suite Allure report from latest results. |

The local Petstore base URI is `http://localhost:8080/v2` by default.

## Project layout

- `src/test/java/org/mtrusov/api`: Rest Assured API clients.
- `src/test/java/org/mtrusov/tests`: JUnit SUT contract tests.
- `src/test/java/org/mtrusov/factories`, `models`, `utils`: test data,
  DTOs, and assertion helpers.
- `src/test/resources/schemas`: JSON Schema assertions for response bodies.
- `test-data/pets` and `test-data/orders`: deterministic seed fixtures.
- `scripts`: local runtime, seeding, and script tests.
- `compose.yaml`: pinned local Swagger Petstore container.
- `docs/contract-policy.md`: contract expectations and known deviations.

## Test execution model

The Maven lifecycle is split by test purpose:

- `mvn test` runs only non-SUT unit/infrastructure tests through Surefire.
  Tests under `org/mtrusov/tests/**` are excluded.
- `mvn verify` runs SUT contract tests through Failsafe, split into regular and
  quarantine executions.

Failsafe executions:

| Execution | Selection | Build impact | Output |
|---|---|---|---|
| `regular-tests` | `org/mtrusov/tests/**`, excluding `@Quarantine` | Gates the build. Any failure fails `verify`. | `target/failsafe-reports/regular`, `target/allure-results/regular` |
| `quarantine-tests` | `org/mtrusov/tests/**`, only `@Quarantine` | Non-gating. Failures are ignored by Maven. | `target/failsafe-reports/quarantine`, `target/allure-results/quarantine` |

`make verify`, `make verify-regular`, and `make verify-quarantine` are thin
wrappers around `mvn verify` with the corresponding skip flags. They do not
start, stop, or reset the SUT. Start the local runtime with `make start` first.

JUnit runs test classes concurrently while methods within a class run on the
same thread. Order-mutating test classes use resource locks to protect shared
Petstore state.

## Reports

Allure results are written per suite:

- Unit tests: `target/allure-results/unit`
- Regular SUT tests: `target/allure-results/regular`
- Quarantined SUT tests: `target/allure-results/quarantine`

Generate a local report after running the corresponding suite:

```bash
make report-regular
make report-unit
make report-quarantine
```

`make report` is an alias for `make report-regular`. Local reports are written
under `target/site/allure-maven-plugin/<suite>/index.html`. The Allure Maven
plugin downloads its runtime on first use and reuses the local cache afterward.

## Configuration

### Runtime target

`PETSTORE_TARGET` selects how scripts resolve the Petstore runtime:

| Value | Use case | Required settings |
|---|---|---|
| `local-compose` | Managed local Compose service. This is the default. | Optional `PETSTORE_PORT`; optional `PETSTORE_ACCESS_LOG_DIR`. |
| `external` | User-supplied Petstore endpoint. | `PETSTORE_BASE_URI` is required. |

Under `local-compose`, the start/seed scripts reject `PETSTORE_BASE_URI` to
avoid guessing ownership from an address. Use `PETSTORE_PORT` for a local port
change, or select `PETSTORE_TARGET=external`.

### Test endpoint resolution

`ConfigLoader` resolves the test base URI in this order:

1. JVM property: `-Dpetstore.baseUri=...`
2. Environment variable: `PETSTORE_BASE_URI`
3. `src/test/resources/application.config.yaml`

The `make verify*` targets pass `-Dpetstore.baseUri=http://localhost:${PETSTORE_PORT}/v2`
when `PETSTORE_BASE_URI` is not set. If `PETSTORE_BASE_URI` is set, they do not
pass a JVM property and let `ConfigLoader` read the environment directly.

### Environment variables

| Variable | Purpose |
|---|---|
| `PETSTORE_API_KEY` | Required by SUT contract tests. Sent as the `api_key` header where auth is used. |
| `PETSTORE_PORT` | Host port for the local Compose service. Defaults to `8080`. |
| `PETSTORE_BASE_URI` | Full endpoint for external runs, for example `https://petstore.swagger.io/v2`. |
| `PETSTORE_TARGET` | Runtime target: `local-compose` or `external`. Defaults to `local-compose`. |
| `PETSTORE_ACCESS_LOG_DIR` | Host directory mounted for local Jetty access logs. |

`PETSTORE_API_KEY` is declared in `application.config.yaml` as
`${PETSTORE_API_KEY}` and resolved from the real environment first, then a
repo-root `.env` file. There is no JVM-property override for the API key.

## Fixtures and isolation

Committed fixtures live under `test-data/pets/` and `test-data/orders/`.
Reserved IDs:

- Read-only pets: `2001-2002`
- Read-only orders: `1001-1002`
- Mutation tests: `9000-9999`
- Guaranteed-missing test ID: `1010101010`

The seeder is idempotent for the pinned Petstore image:

```bash
make seed
```

The local Petstore stores data in memory. `make reset` recreates the container
and reapplies the fixtures.

## Running against an external Petstore

External runs are explicit opt-in:

```bash
PETSTORE_TARGET=external PETSTORE_BASE_URI=https://petstore.swagger.io/v2 make verify
```

Warning: the suite creates and deletes data. Do not run mutation tests against a
shared public service unless you intend to mutate shared public state.

## Logs

Jetty access logs are written to `.runtime/petstore-logs/access/` by default
and are gitignored. Application output is available through Docker Compose:

```bash
make logs
```

If startup readiness times out, the startup script prints Compose status and
recent container logs before exiting.

## CI reports

CI publishes browsable Allure reports to GitHub Pages separately from the
merge-gating `Tests` workflow. The reporting workflow (`Reports`) never gates a
merge; `Tests / test` remains the required check.

- Public dashboard: <https://trusovn.github.io/petstore-v2-tests/>
- Reports are separated by suite (`unit`, `regular`, `quarantine`) and ref
  (`main`, `pr-<number>`).
- Allure history is kept per `(ref, suite)` and capped at 20 launches.
- PRs receive one updatable comment with unit/regular counts, bounded failure
  details, and report links. Quarantine remains browsable but is excluded from
  aggregate pass/fail statistics.
- Closed PR reports are retained for seven days, then removed by a scheduled
  cleanup.
- Manually dispatched `Tests` runs produce a downloadable, seven-day,
  offline-viewable HTML bundle instead of a Pages entry.

GitHub Pages for this repository is public. CI reports may contain diagnostic
request/response attachments, captured failure output, and stack traces. Do not
run CI against fixtures or secrets that must remain private.

## Troubleshooting

If port `8080` is already in use, select another host port:

```bash
PETSTORE_PORT=18080 make start
PETSTORE_PORT=18080 make verify-regular
```

If `make verify*` fails before tests run, check that `PETSTORE_API_KEY` is set
in the environment or in `.env`.

If the local server state looks stale or polluted by a previous run:

```bash
make reset
```

If a report command fails with "No ... Allure results found", run the
corresponding test command first, for example `make verify-regular` before
`make report-regular`.
