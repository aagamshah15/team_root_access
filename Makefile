# Tomato Harvest POC. See CLAUDE.md and SPEC.md.
PY ?= .venv/bin/python
export HARVEST_INPUTS ?= $(abspath out)

.PHONY: setup test build app artifact web web-test web-dev

setup:
	python3 -m venv .venv
	.venv/bin/pip install -q -r requirements-poc.txt

test:
	"$(PY)" -m pytest -q
	"$(PY)" contracts/check.py
	"$(PY)" app/check_app.py
	node tests/test_trip.cjs
	node tests/test_trip.cjs

build:
	"$(PY)" scripts/select_photos.py
	"$(PY)" -m harvest.publish
	"$(PY)" contracts/check.py app/data
	"$(PY)" app/check_app.py app/data

app:
	"$(PY)" -m http.server 8766 --directory app

artifact:
	"$(PY)" scripts/artifact_page.py

web-test:            ## React app: typecheck + Vitest
	cd web && npm run typecheck && npm test

web:                 ## React app: build static files into web/dist (copies app/data first)
	cd web && npm run build

web-dev:             ## React app: dev server
	cd web && npm run dev
