.DEFAULT_GOAL := help

.PHONY: help start reset seed stop status logs test verify verify-regular verify-quarantine report report-regular report-quarantine report-unit

help:
	@printf '%s\n' \
		'Petstore development commands:' \
		'  make start   Start the server and seed fixtures' \
		'  make reset   Recreate the server and seed fixtures' \
		'  make seed    Reapply deterministic fixtures' \
		'  make stop    Stop and remove the server' \
		'  make status  Show the Compose service status' \
		'  make logs    Follow the server logs' \
		'  make test    Run local unit tests' \
		'  make verify             Run regular and quarantined SUT tests' \
		'  make verify-regular     Run build-gating SUT tests' \
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

verify:
	./scripts/run-with-diagnostics.sh verify -DskipLocalTests=true

verify-regular:
	./scripts/run-with-diagnostics.sh verify -DskipLocalTests=true -DskipQuarantineTests=true

verify-quarantine:
	./scripts/run-with-diagnostics.sh verify -DskipLocalTests=true -DskipRegularTests=true

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
