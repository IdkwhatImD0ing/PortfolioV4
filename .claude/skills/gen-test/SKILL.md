---
name: gen-test
description: Generate tests following this repo's conventions — Vitest for client pure logic, pytest-asyncio for the server. Use when asked to write, scaffold, or add tests.
disable-model-invocation: true
---

# gen-test

Scaffold tests that match this repo's two established idioms. Pick the side based
on the file under test.

## Frontend — Vitest (`client/`)

- Test pure logic extracted into `client/src/lib/*`. Components stay thin;
  testable behavior lives in `src/lib` next to a `*.test.ts` sibling (see
  `voice-bus.test.ts`, `transcript.test.ts`, `portfolio-data.test.ts`).
- Import style: `import { describe, expect, it } from "vitest";` then import the
  unit from its relative module (`"./voice-bus"`).
- Group with `describe(functionName, ...)`, one `it(...)` per behavior, plain
  `expect(...).toEqual(...)`. No mocking framework is in use — prefer pure
  functions and literal fixtures.
- Run: `pnpm exec vitest run src/lib/<name>.test.ts` (or `-t "<pattern>"`).
  CI runs `pnpm test`. See `references/vitest-example.test.ts`.

## Backend — pytest-asyncio (`server/`)

- Tests live in `server/tests/test_*.py`, grouped in `class TestX:` with
  `test_*` methods. `asyncio_mode = "auto"` (in `pyproject.toml`), so
  `async def test_...` needs no decorator.
- Reuse fixtures from `server/tests/conftest.py` instead of re-mocking:
  `app_client` / `async_app_client` (FastAPI TestClient), `mock_retell`,
  `mock_pinecone`, `mock_openai_embeddings`, `sample_utterances`,
  `sample_response_request`, `sample_text_messages`, `mock_websocket`.
  Env keys are pre-set in conftest; the Pinecone index is auto-reset per test.
- Tag tests that hit real external services with `@pytest.mark.integration`
  (they are excluded from the default run; invoke with `-m integration`).
- Run: `uv run pytest tests/test_<name>.py -v` (single:
  `... ::TestClass::test_method`). CI runs `uv run pytest tests/`.
  See `references/pytest-example.py`.

## Output

Write the test file in the correct location, mirroring the closest existing
test's structure and naming. Cover the happy path plus edge cases (null/empty,
malformed input, error branches). Then state the exact command to run it.
