.PHONY: up down demo test e2e verify load logs clean

# build images and start the whole stack (postgres, valkey, migrate, api, relay, worker, web)
up:
	docker compose up -d --build

# start + wait for the API + seed a few payments so the dashboard opens with data
demo: up
	@echo "waiting for the API to be ready..."
	@until curl -sf http://localhost:3000/health/live >/dev/null 2>&1; do sleep 2; done
	@echo "seeding payments..."
	@for i in 1 2 3 4 5; do \
		curl -s -o /dev/null -X POST http://localhost:3000/v1/payments \
			-H 'Content-Type: application/json' \
			-H "Idempotency-Key: seed-$$i-$$(date +%s%N)" \
			-d "{\"customerId\":\"C12345\",\"amount\":\"250.00\",\"sourceAccount\":\"VA10001\",\"destinationAccount\":\"EXT98765\",\"reference\":\"PMT-100$$i\"}"; \
	done
	@echo "\nready → open http://localhost:3001"

# run the unit test suites (excludes the black-box e2e package, which needs a live stack)
test:
	pnpm -r --filter='!@apps/e2e' test

# black-box HTTP suite against a running stack (run `make up` first)
e2e:
	pnpm --filter @apps/e2e test

# PRODUCTION-PARITY check: build the REAL image + run the e2e suite against the
# compiled compose stack (same artifact + commands we deploy), then tear down.
# This is what CI runs — "test exactly as we ship".
verify:
	docker compose down -v >/dev/null 2>&1 || true
	docker compose up -d --build
	@for i in $$(seq 1 60); do curl -sf http://localhost:3000/health/ready >/dev/null 2>&1 && break || sleep 2; done
	@pnpm --filter @apps/e2e test; s=$$?; docker compose down -v; exit $$s

# load test the API (POST inserts + GET reads) against a running stack
load:
	node scripts/loadtest.mjs post
	node scripts/loadtest.mjs get

logs:
	docker compose logs -f

# stop the stack (keep data)
down:
	docker compose down

# stop the stack and delete volumes (fresh start)
clean:
	docker compose down -v
