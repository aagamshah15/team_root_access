PY ?= .venv/bin/python

.PHONY: setup test build web web-test web-dev

setup:
	python3 -m venv .venv
	.venv/bin/python -m pip install -r requirements.txt

test:
	"$(PY)" -m pytest -q
	"$(PY)" scripts/check_published.py
	"$(PY)" scripts/check_joins.py

build:
	"$(PY)" -m harvest.publish
	"$(PY)" scripts/check_published.py
	"$(PY)" scripts/check_joins.py

web:
	cd web && npm run build

web-test:
	cd web && npm run typecheck && npm test

web-dev:
	cd web && npm run dev
