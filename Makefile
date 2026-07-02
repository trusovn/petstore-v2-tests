.DEFAULT_GOAL := help

.PHONY: help start reset seed stop status logs test report

help:
	@printf '%s\n' \
		'Petstore development commands:' \
		'  make start   Start the server and seed fixtures' \
		'  make reset   Recreate the server and seed fixtures' \
		'  make seed    Reapply deterministic fixtures' \
		'  make stop    Stop and remove the server' \
		'  make status  Show the Compose service status' \
		'  make logs    Follow the server logs' \
		'  make test    Run the draft Maven test suite' \
		'  make report  Generate an Allure report from the latest test results'

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

report:
	mvn allure:report
