.DEFAULT_GOAL := help
SHELL := /usr/bin/env bash

.PHONY: help start reset seed stop status logs test test-scripts verify verify-regular verify-quarantine report report-regular report-quarantine report-unit

help:
	@printf '%s\n' \
		'Petstore development commands:' \
		'  make start   Start the server and seed fixtures' \
		'  make reset   Recreate the server and seed fixtures' \
		'  make seed    Reapply deterministic fixtures' \
		'  make stop    Stop and remove the server' \
		'  make status  Show the Compose service status' \
		'  make logs    Follow the server logs' \
		'  make test    Run local unit tests (Surefire, non-SUT)' \
		'  make test-scripts  Run the context-resolver shell tests' \
		'  make verify             Run regular and quarantined SUT tests (Failsafe)' \
		'  make verify-regular     Run build-gating SUT tests only' \
		'  make verify-quarantine  Run quarantined SUT tests without failing the build' \
		'  make report            Generate an Allure report from the latest regular test results' \
		'  make report-regular     Generate an Allure report from regular (build-gating) test results' \
		'  make report-quarantine  Generate an Allure report from quarantined test results' \
		'  make report-unit        Generate an Allure report from local unit (non-SUT) test results'

start:
	./scripts/start-local-petstore.sh

reset:
	./scripts/start-local-petstore.sh --reset

seed:
	./scripts/seed-local-petstore.sh

stop:
	docker compose down

status:
	docker compose ps

logs:
	docker compose logs --follow petstore

test:
	mvn test

test-scripts:
	./scripts/test/run-script-tests.sh

# Failsafe runs the SUT contract tests during `verify`. These are thin
# mvn wrappers. Base URI resolution: an explicit PETSTORE_BASE_URI env wins
# (ConfigLoader reads it directly, so no -D is passed); otherwise PETSTORE_PORT
# (default 8080) is translated to -Dpetstore.baseUri so a non-default port is
# honored. The JVM property takes precedence over the env var, so -D is only
# passed when PETSTORE_BASE_URI is unset.
verify:
	base=""; if [ -z "$${PETSTORE_BASE_URI:-}" ]; then base="-Dpetstore.baseUri=http://localhost:$${PETSTORE_PORT:-8080}/v2"; fi; mvn verify -DskipLocalTests=true $$base

verify-regular:
	base=""; if [ -z "$${PETSTORE_BASE_URI:-}" ]; then base="-Dpetstore.baseUri=http://localhost:$${PETSTORE_PORT:-8080}/v2"; fi; mvn verify -DskipLocalTests=true -DskipQuarantineTests=true $$base

verify-quarantine:
	base=""; if [ -z "$${PETSTORE_BASE_URI:-}" ]; then base="-Dpetstore.baseUri=http://localhost:$${PETSTORE_PORT:-8080}/v2"; fi; mvn verify -DskipLocalTests=true -DskipRegularTests=true $$base

report: report-regular

report-regular:
	@set -- target/allure-results/regular/*-result.json; test -f "$$1" || { printf '%s\n' 'No regular Allure results found. Run make verify or make verify-regular first.' >&2; exit 1; }
	mvn allure:report -Dallure.results.directory=allure-results/regular -Dallure.report.directory=$(CURDIR)/target/site/allure-maven-plugin/regular -Dallure.history.enabled=false

report-quarantine:
	@set -- target/allure-results/quarantine/*-result.json; test -f "$$1" || { printf '%s\n' 'No quarantine Allure results found. Run make verify or make verify-quarantine first.' >&2; exit 1; }
	mvn allure:report -Dallure.results.directory=allure-results/quarantine -Dallure.report.directory=$(CURDIR)/target/site/allure-maven-plugin/quarantine -Dallure.history.enabled=false

report-unit:
	@set -- target/allure-results/unit/*-result.json; test -f "$$1" || { printf '%s\n' 'No unit Allure results found. Run make test first.' >&2; exit 1; }
	mvn allure:report -Dallure.results.directory=allure-results/unit -Dallure.report.directory=$(CURDIR)/target/site/allure-maven-plugin/unit -Dallure.history.enabled=false
