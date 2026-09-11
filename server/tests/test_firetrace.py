"""Tests for firetrace.py: the FireTrace exporter.

Three layers:

* Pure functions: redaction, payload building, the retry policy.
* The processor driven through the real Agents SDK tracing API, with the
  SDK's OpenAI exporter swapped out and the network call stubbed.
* The guarantees the app relies on: tracing never raises, never blocks the
  caller's thread, never sends when no key is configured, never logs the key.
"""

# ruff: noqa: SIM117 - nested `with` blocks read better in these scenarios
from __future__ import annotations

import json
import re
import threading
import urllib.error
from dataclasses import dataclass
from datetime import UTC
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from agents.tracing import agent_span
from agents.tracing import trace as sdk_trace
from agents.tracing.setup import get_trace_provider

import firetrace
from firetrace import (
    _RunRecord,
    _SpanSnapshot,
    annotate,
    build_payload,
    redact,
    redact_text,
    send_with_retry,
    step,
    traced_run,
)

FAKE_KEY = "ft_live_" + "0123456789abcdef" + "_" + "f" * 64
# conftest stubs firetrace._deliver for every test; keep the real one for the
# two tests that exercise the HTTP request itself.
REAL_DELIVER = firetrace._deliver
HEX16 = re.compile(r"^[0-9a-f]{16}$")
HEX32 = re.compile(r"^[0-9a-f]{32}$")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")

# Field sets copied from https://tracing.art3m1s.me/api/v1/openapi.json. The
# API rejects unknown keys with 400, so anything outside these is a bug.
TRACE_KEYS = {
    "id", "name", "status", "startedAt", "endedAt", "provider", "model",
    "sessionId", "userId", "tags", "input", "output", "metadata", "usage",
    "costUsd", "spans",
}
SPAN_KEYS = {
    "id", "parentSpanId", "name", "kind", "status", "startedAt", "endedAt",
    "provider", "model", "input", "output", "attributes", "events", "usage",
    "costUsd",
}
USAGE_KEYS = {"inputTokens", "outputTokens", "totalTokens"}
KINDS = {"llm", "agent", "tool", "chain", "retriever", "embedding", "reranker", "custom"}


def assert_matches_contract(payload: dict) -> None:
    """Structural check against the ingestion schema (strict, like the API)."""
    assert set(payload) == {"schemaVersion", "trace"}
    assert payload["schemaVersion"] == 1
    trace = payload["trace"]
    assert set(trace) <= TRACE_KEYS
    for key in ("id", "name", "startedAt", "endedAt"):
        assert key in trace
    assert HEX32.match(trace["id"])
    assert 1 <= len(trace["name"]) <= 500
    assert trace.get("status", "unset") in {"ok", "error", "unset"}
    assert ISO.match(trace["startedAt"]) and ISO.match(trace["endedAt"])
    assert trace["endedAt"] >= trace["startedAt"]
    assert "environment" not in trace
    assert len(trace.get("tags", [])) <= 20
    assert all(1 <= len(t) <= 64 for t in trace.get("tags", []))
    assert set(trace.get("usage", {})) <= USAGE_KEYS
    for k in ("provider", "model", "sessionId", "userId"):
        if k in trace:
            assert 1 <= len(trace[k]) <= 200
    spans = trace.get("spans", [])
    assert len(spans) <= 200
    ids = [s["id"] for s in spans]
    assert len(ids) == len(set(ids)), "span ids must be unique within the trace"
    for span in spans:
        assert set(span) <= SPAN_KEYS
        for key in ("id", "name", "startedAt", "endedAt"):
            assert key in span
        assert HEX16.match(span["id"])
        parent = span.get("parentSpanId")
        assert parent is None or (parent in ids and parent != span["id"])
        assert span.get("kind", "custom") in KINDS
        assert span.get("status", "unset") in {"ok", "error", "unset"}
        assert ISO.match(span["startedAt"]) and ISO.match(span["endedAt"])
        assert span["endedAt"] >= span["startedAt"]
        assert set(span.get("usage", {})) <= USAGE_KEYS
        assert len(span.get("events", [])) <= 50
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    assert len(body) <= 2 * 1024 * 1024


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv(firetrace.API_KEY_ENV, FAKE_KEY)
    return FAKE_KEY


@pytest.fixture
def only_firetrace():
    """Route SDK tracing to our processor alone (no OpenAI exporter)."""
    from agents.tracing.scope import Scope

    provider = get_trace_provider()
    processor = firetrace.install()  # before the snapshot, so the restore keeps it
    saved = provider._multi_processor._processors
    provider.set_processors([processor])
    yield processor
    provider.set_processors(list(saved))
    # A run that ends in GeneratorExit deliberately leaves the SDK's "current
    # trace" set (the SDK cannot know which context the finalizer runs in);
    # clear it so the next test starts clean.
    Scope.set_current_span(None)
    Scope.set_current_trace(None)


@dataclass
class Sent:
    bodies: list
    threads: list


@pytest.fixture
def sent(monkeypatch):
    """Capture what would have been POSTed; answers 201."""
    record = Sent(bodies=[], threads=[])

    def fake_deliver(body: bytes, api_key: str, timeout: float | None = None):
        record.bodies.append(json.loads(body.decode("utf-8")))
        record.threads.append(threading.current_thread().name)
        return 201, {
            "ok": True,
            "traceId": "x",
            "projectId": "proj",
            "spanCount": 0,
            "duplicate": False,
            "requestId": "r",
        }

    monkeypatch.setattr(firetrace, "_deliver", fake_deliver)
    return record


def flush() -> None:
    firetrace._PROCESSOR.force_flush()


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------


class TestRedaction:
    def test_scrubs_keys_tokens_and_pii(self):
        text = (
            f"key {FAKE_KEY} openai sk-abcdefghijklmnopqrstuvwxyz0123 "
            "Authorization: Bearer abc.def-ghi "
            "mail me at jane.doe+x@example.com or call (415) 555-0132, "
            "ssn 123-45-6789, card 4111 1111 1111 1111, ip 10.1.2.3, "
            "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop "
            "pinecone pcsk_ABCdef123456_x retell key_" + "a" * 32 + " "
            "aws AKIAIOSFODNN7EXAMPLE gh ghp_" + "b" * 36
        )
        out = redact_text(text)
        assert FAKE_KEY not in out
        assert "sk-abcdefghijklmnopqrstuvwxyz0123" not in out
        assert "Bearer [REDACTED]" in out and "abc.def-ghi" not in out
        assert "jane.doe" not in out and "[EMAIL]" in out
        assert "555-0132" not in out and "[PHONE]" in out
        assert "123-45-6789" not in out and "[SSN]" in out
        assert "4111" not in out and "[CARD]" in out
        assert "10.1.2.3" not in out and "[IP]" in out
        assert "eyJhbGciOiJIUzI1NiJ9" not in out and "[REDACTED_JWT]" in out
        assert "pcsk_" not in out
        assert "key_" + "a" * 32 not in out
        assert "AKIAIOSFODNN7EXAMPLE" not in out
        assert "ghp_" not in out

    def test_leaves_ordinary_content_alone(self):
        text = (
            "DispatchAI won 1st at TreeHacks 2024; 35 of 50 teams. "
            "See https://github.com/IdkwhatImD0ing/DispatchAI and project id "
            "dispatch-ai, call_abc123, score 0.812, version 1.2.3."
        )
        assert redact_text(text) == text

    def test_luhn_guards_the_card_rule(self):
        # 16 digits that fail Luhn are not a card number.
        assert redact_text("order 1234 5678 9012 3456") == "order 1234 5678 9012 3456"

    def test_generic_token_rule_needs_mixed_case_and_digits(self):
        token = "Ab3" * 20
        assert redact_text(f"x {token} y") == "x [REDACTED_TOKEN] y"
        assert redact_text("z" * 60) == "z" * 60
        assert redact_text("dispatch-ai-emergency-response-hackathon-winner-treehacks") == (
            "dispatch-ai-emergency-response-hackathon-winner-treehacks"
        )
        assert redact_text("z" * 40 + "1" * 20) == "z" * 40 + "1" * 20
        # 40+ hex characters in a row are a hash or a secret, never a word.
        assert redact_text("sha " + "a" * 60) == "sha [REDACTED_TOKEN]"

    def test_phone_numbers_at_sentence_end_and_digit_runs(self):
        assert redact_text("Call me at 415-555-0132.") == "Call me at [PHONE]."
        assert redact_text("Call (415) 555-0132, thanks") == "Call [PHONE], thanks"
        assert redact_text("Reach me at +1 415 555 0132.") == "Reach me at [PHONE]."
        # Digit continuations are versions or ids, not phone numbers.
        assert redact_text("Node 20.11.1 and ticket 123-456-7890-1") == "Node 20.11.1 and ticket 123-456-7890-1"
        assert redact_text("epoch 1700000000000") == "epoch 1700000000000"

    def test_openai_ids_survive_the_hex_rule(self):
        resp = "resp_" + "67ccd2bed1ec8190b14f964abc0542670bb6a6b452d3795b"
        msg = "msg_" + "a1" * 24
        assert redact_text(f"{resp} {msg}") == f"{resp} {msg}"
        # But a bare 40+ hex run, or one after '=' or ':', is still a token.
        assert redact_text("token=" + "ab" * 24) == "token=[REDACTED_TOKEN]"
        assert redact_text("sha " + "0f" * 20) == "sha [REDACTED_TOKEN]"

    def test_private_key_block_is_redacted(self):
        pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----"
        assert redact_text(f"here {pem} ok") == "here [REDACTED_PRIVATE_KEY] ok"
        rsa = "-----BEGIN RSA PRIVATE KEY-----\nabc+/=\n-----END RSA PRIVATE KEY-----"
        assert "[REDACTED_PRIVATE_KEY]" in redact_text(rsa)

    def test_lone_surrogates_are_made_encodable(self):
        text = json.loads('"hi \\ud83d there"')
        out = redact({"content": text, text: 1})
        json.dumps(out, ensure_ascii=False).encode("utf-8")
        assert out["content"].startswith("hi ")

    def test_keys_are_bounded_in_bytes_not_characters(self):
        out = redact({"\u4e2d" * 600: 1})
        (key,) = out.keys()
        assert len(key.encode("utf-8")) <= 1000
        json.dumps(out, ensure_ascii=False).encode("utf-8")

    def test_redaction_is_linear_on_long_runs(self):
        import time

        samples = [
            "z" * 60_000,
            "a1" * 30_000,
            "f" * 60_000 + "g",
            "user" * 15_000 + "@",
            "9" * 60_000,
            "-----BEGIN PRIVATE KEY----- " * 2300,
            "-----BEGIN PRIVATE KEY-----" + "A" * 60_000,
        ]
        t0 = time.perf_counter()
        for s in samples:
            redact_text(s)
        assert time.perf_counter() - t0 < 2.0

    def test_values_under_secret_keys_are_dropped(self):
        out = redact(
            {
                "api_key": "plain",
                "Authorization": "x",
                "nested": {"password": "hunter2", "ok": "fine"},
                "X-Retell-Signature": "sig",
            }
        )
        assert out["api_key"] == "[REDACTED]"
        assert out["Authorization"] == "[REDACTED]"
        assert out["nested"]["password"] == "[REDACTED]"
        assert out["nested"]["ok"] == "fine"
        assert out["X-Retell-Signature"] == "[REDACTED]"

    def test_long_strings_and_lists_are_capped(self):
        out = redact({"s": "x" * 30_000, "l": list(range(500))})
        assert len(out["s"]) < firetrace.MAX_STRING_CHARS + 100 and "truncated" in out["s"]
        assert len(out["l"]) == 101
        assert any(isinstance(v, str) and "elided" in v for v in out["l"])

    def test_non_json_objects_become_json(self):
        from datetime import datetime

        @dataclass
        class Point:
            x: int
            y: float

        class Model:
            def model_dump(self, mode="json"):
                return {"a": 1}

        out = redact(
            {
                "dt": datetime(2026, 9, 10, tzinfo=UTC),
                "bytes": b"\x00\x01",
                "nan": float("nan"),
                "set": {1},
                "dc": Point(1, 2.5),
                "model": Model(),
                "obj": object(),
            }
        )
        assert out["dt"].startswith("2026-09-10")
        assert out["bytes"] == "[2 bytes]"
        assert out["nan"] is None
        assert out["set"] == [1]
        assert out["dc"] == {"x": 1, "y": 2.5}
        assert out["model"] == {"a": 1}
        assert isinstance(out["obj"], str)
        json.dumps(out)

    def test_firestore_illegal_keys_are_renamed(self):
        out = redact({"": 1, "__proto__": 2, "fine": 3})
        assert set(out) == {"_", "_proto_", "fine"}


# ---------------------------------------------------------------------------
# Payload building (no SDK involved)
# ---------------------------------------------------------------------------


def make_record(**overrides) -> _RunRecord:
    base = {
        "sdk_trace_id": "trace_" + "a" * 32,
        "trace_id": "a" * 32,
        "name": "portfolio_text_response",
        "session_id": "text-1234",
        "model": "gpt-5.6-terra",
        "input": {"messages": [{"role": "user", "content": "hi"}]},
        "output": {"text": "hello"},
        "tags": ["text"],
        "metadata": {"mode": "text"},
        "started_at": "2026-09-10T10:00:00.000+00:00",
        "ended_at": "2026-09-10T10:00:05.000+00:00",
    }
    base.update(overrides)
    return _RunRecord(**base)


def snap(id, type, data, parent=None, started="2026-09-10T10:00:01.000+00:00",
         ended="2026-09-10T10:00:02.000+00:00", error=None, extra=None) -> _SpanSnapshot:
    return _SpanSnapshot(
        id=id, parent_id=parent, started_at=started, ended_at=ended,
        type=type, data=data, error=error, extra=extra or {},
    )


def response_data(text="hello", tool=None, model="gpt-5.6-terra-2026"):
    output = [SimpleNamespace(type="reasoning", summary=[SimpleNamespace(text="think")])]
    if tool:
        output.append(SimpleNamespace(type="function_call", name=tool, arguments='{"q":1}', call_id="c1"))
    output.append(SimpleNamespace(type="message", content=[SimpleNamespace(text=text)]))
    return SimpleNamespace(
        response=SimpleNamespace(id="resp_1", model=model, output=output),
        input=[{"role": "user", "content": "hi"}],
        usage={
            "requests": 1, "input_tokens": 100, "output_tokens": 20, "total_tokens": 120,
            "input_tokens_details": {"cached_tokens": 50},
            "output_tokens_details": {"reasoning_tokens": 7},
        },
    )


class TestBuildPayload:
    def test_tree_kinds_usage_and_filters(self):
        snaps = [
            snap("span_agent", "agent", SimpleNamespace(name="portfolio_agent", tools=["search_projects"], handoffs=None, output_type=None),
                 started="2026-09-10T10:00:00.500+00:00", ended="2026-09-10T10:00:04.900+00:00"),
            snap("span_guard", "guardrail", SimpleNamespace(name="security_guardrail", triggered=False), parent="span_agent"),
            snap("span_gagent", "agent", SimpleNamespace(name="Security Guardrail", tools=None, handoffs=None, output_type="ScreeningDecision"), parent="span_guard"),
            snap("span_gllm", "response", response_data('{"rule":"Q3"}', model="gpt-5.6-luna"), parent="span_gagent",
                 extra={"guardrail.rule": "Q3"}),
            snap("span_llm1", "response", response_data("", tool="search_projects"), parent="span_agent"),
            snap("span_tool", "function", SimpleNamespace(name="search_projects", input='{"query": "voice ai", "message": "Searching"}', output="Found 3", mcp_data=None), parent="span_agent"),
            snap("span_embed", "custom", SimpleNamespace(name="embed-query", data={"kind": "embedding", "provider": "openai", "model": "text-embedding-3-large", "input": "voice ai", "usage": {"inputTokens": 3, "totalTokens": 3}, "output": {"dimensions": 3072}}), parent="span_tool"),
            snap("span_query", "custom", SimpleNamespace(name="pinecone.query", data={"kind": "retriever", "provider": "pinecone", "index": "portfolio", "top_k": 3, "output": [{"id": "dispatch-ai", "score": 0.8}]}), parent="span_tool"),
            snap("span_llm2", "response", response_data("here you go"), parent="span_agent",
                 started="2026-09-10T10:00:03.000+00:00", ended="2026-09-10T10:00:04.000+00:00"),
        ]
        payload = build_payload(make_record(user_id="u-9"), snaps)
        assert_matches_contract(payload)
        trace = payload["trace"]
        assert trace["name"] == "portfolio_text_response"
        assert trace["status"] == "ok"
        assert trace["sessionId"] == "text-1234" and trace["userId"] == "u-9"
        assert trace["provider"] == "openai" and trace["model"] == "gpt-5.6-terra"
        assert trace["tags"] == ["text"]
        assert trace["input"] == {"messages": [{"role": "user", "content": "hi"}]}
        assert trace["output"] == {"text": "hello"}
        # Usage is the sum over LLM spans (guardrail judge included).
        assert trace["usage"] == {"inputTokens": 300, "outputTokens": 60, "totalTokens": 360}

        by_name = {s["name"]: s for s in trace["spans"]}
        root = by_name["portfolio_agent"]
        assert root["kind"] == "agent" and root["parentSpanId"] is None
        assert by_name["guardrail:security_guardrail"]["parentSpanId"] == root["id"]
        assert by_name["guardrail:security_guardrail"]["kind"] == "custom"
        assert by_name["Security Guardrail"]["parentSpanId"] == by_name["guardrail:security_guardrail"]["id"]
        judge = by_name["gpt-5.6-luna"]
        assert judge["kind"] == "llm" and judge["parentSpanId"] == by_name["Security Guardrail"]["id"]
        assert judge["attributes"]["guardrail.rule"] == "Q3"
        llm = by_name["gpt-5.6-terra-2026"]
        assert llm["kind"] == "llm" and llm["provider"] == "openai"
        assert llm["usage"] == {"inputTokens": 100, "outputTokens": 20, "totalTokens": 120}
        assert llm["attributes"]["usage.cached_tokens"] == 50
        assert llm["attributes"]["usage.reasoning_tokens"] == 7
        assert llm["attributes"]["response.id"] == "resp_1"
        assert llm["output"]["text"] == "here you go"
        assert llm["output"]["reasoning_summary"] == ["think"]
        assert llm["input"] == [{"role": "user", "content": "hi"}]
        tool = by_name["search_projects"]
        assert tool["kind"] == "tool" and tool["parentSpanId"] == root["id"]
        assert tool["input"] == {"query": "voice ai", "message": "Searching"}
        assert tool["output"] == "Found 3"
        embed = by_name["embed-query"]
        assert embed["kind"] == "embedding" and embed["parentSpanId"] == tool["id"]
        assert embed["provider"] == "openai" and embed["model"] == "text-embedding-3-large"
        assert embed["usage"] == {"inputTokens": 3, "totalTokens": 3}
        assert embed["input"] == "voice ai" and embed["output"] == {"dimensions": 3072}
        query = by_name["pinecone.query"]
        assert query["kind"] == "retriever" and query["provider"] == "pinecone"
        assert query["attributes"] == {"index": "portfolio", "top_k": 3}
        # Model calls that ended in a tool call carry it in the output.
        first = [s for s in trace["spans"] if s["kind"] == "llm" and "tool_calls" in (s.get("output") or {})]
        assert first and first[0]["output"]["tool_calls"][0]["name"] == "search_projects"
        assert trace["metadata"]["firetrace.exporter"]

    def test_guardrail_refusal_is_ok_and_tagged(self):
        tripwire = {"message": "Guardrail tripwire triggered", "data": {"guardrail": "security_guardrail", "type": "input_guardrail"}}
        snaps = [
            snap("a", "agent", SimpleNamespace(name="portfolio_agent"), error=tripwire),
            snap("g", "guardrail", SimpleNamespace(name="security_guardrail", triggered=True), parent="a"),
        ]
        payload = build_payload(make_record(guardrail_blocked=True, output={"text": "refused"}), snaps)
        assert_matches_contract(payload)
        trace = payload["trace"]
        assert trace["status"] == "ok"
        assert "guardrail-blocked" in trace["tags"]
        assert trace["metadata"]["guardrail.blocked"] is True
        spans = {s["name"]: s for s in trace["spans"]}
        assert spans["portfolio_agent"]["status"] == "ok"
        assert spans["portfolio_agent"]["attributes"]["guardrail.tripwire"] is True
        assert spans["guardrail:security_guardrail"]["attributes"]["guardrail.triggered"] is True

    def test_span_error_marks_trace_error(self):
        err = {"message": "Error getting response", "data": {"error": "RateLimitError: 429"}}
        snaps = [
            snap("a", "agent", SimpleNamespace(name="portfolio_agent")),
            snap("r", "response", SimpleNamespace(response=None, input=None, usage=None), parent="a", error=err),
        ]
        payload = build_payload(make_record(), snaps)
        assert_matches_contract(payload)
        trace = payload["trace"]
        assert trace["status"] == "error"
        llm = next(s for s in trace["spans"] if s["kind"] == "llm")
        assert llm["name"] == "openai.responses" and "model" not in llm
        assert llm["status"] == "error"
        assert llm["attributes"]["error.type"] == "Error getting response"
        assert llm["attributes"]["error.message"] == "Error getting response: RateLimitError: 429"

    def test_run_error_and_lifecycle_flags(self):
        payload = build_payload(make_record(error=("ValueError", "boom"), abandoned=True, cancelled=True), [])
        assert_matches_contract(payload)
        trace = payload["trace"]
        assert trace["status"] == "error"
        assert trace["metadata"]["error.type"] == "ValueError"
        assert trace["metadata"]["error.message"] == "boom"
        assert {"abandoned", "cancelled"} <= set(trace["tags"])
        assert trace["metadata"]["run.abandoned"] is True

    def test_unfinished_span_is_closed_at_trace_end(self):
        snaps = [snap("a", "agent", SimpleNamespace(name="portfolio_agent"), ended=None)]
        payload = build_payload(make_record(), snaps)
        assert_matches_contract(payload)
        span = payload["trace"]["spans"][0]
        assert span["status"] == "unset"
        assert span["endedAt"] == payload["trace"]["endedAt"]
        assert span["attributes"]["firetrace.unfinished"] is True

    def test_span_cap_and_dropped_count(self):
        snaps = [snap("root", "agent", SimpleNamespace(name="a"), started="2026-09-10T10:00:00.000+00:00")]
        for i in range(260):
            snaps.append(snap(f"s{i}", "custom", SimpleNamespace(name=f"step{i}", data={}), parent="root",
                              started=f"2026-09-10T10:00:{1 + i // 60:02d}.{(i % 60) * 10:03d}+00:00",
                              ended="2026-09-10T10:00:09.000+00:00"))
        payload = build_payload(make_record(dropped_spans=5), snaps)
        assert_matches_contract(payload)
        assert len(payload["trace"]["spans"]) == 200
        assert payload["trace"]["metadata"]["firetrace.droppedSpans"] == 66
        assert payload["trace"]["spans"][0]["name"] == "a"

    def test_oversize_content_is_cut_to_fit(self):
        big = "y" * 3000
        # 200 spans x 36 KB of output = 7 MB before the per-span cap (32 KB)
        # and 6.4 MB after it; both far over the 2 MiB request limit.
        snaps = [
            snap(f"s{i}", "function", SimpleNamespace(name="t", input=None, output=[big] * 12, mcp_data=None),
                 started=f"2026-09-10T10:00:{i % 60:02d}.000+00:00", ended="2026-09-10T10:01:00.000+00:00")
            for i in range(200)
        ]
        payload = build_payload(make_record(input=[{"content": big}] * 60), snaps)
        assert_matches_contract(payload)
        assert "spans.content" in payload["trace"]["metadata"]["firetrace.truncated"]
        assert all("output" not in s for s in payload["trace"]["spans"])

    def test_field_level_truncation_is_flagged(self):
        snaps = [snap("t", "function", SimpleNamespace(name="t", input="x", output="z" * 50_000, mcp_data=None))]
        payload = build_payload(make_record(), snaps)
        assert_matches_contract(payload)
        span = payload["trace"]["spans"][0]
        assert "truncated" in span["output"]
        assert span["attributes"]["firetrace.truncated"] == ["output"]

    def test_bad_timestamps_and_long_fields_are_bounded(self):
        rec = make_record(
            started_at="2026-09-10T10:00:05.000+00:00",
            ended_at="2026-09-10T10:00:00.000+00:00",
            session_id="s" * 500,
            tags=["", "x" * 100, "text", "text"],
            name="n" * 600,
        )
        snaps = [snap("a", "agent", SimpleNamespace(name="p" * 700), started="2026-09-10T10:00:09.000+00:00",
                      ended="2026-09-10T10:00:01.000+00:00")]
        payload = build_payload(rec, snaps)
        assert_matches_contract(payload)
        trace = payload["trace"]
        assert trace["endedAt"] == trace["startedAt"]
        assert len(trace["sessionId"]) == 200 and len(trace["name"]) == 500
        assert trace["tags"] == ["x" * 64, "text"]

    def test_redaction_reaches_every_field(self):
        secret = "sk-supersecretvalue1234567890abcdef"
        snaps = [
            snap("a", "agent", SimpleNamespace(name="portfolio_agent"), extra={"note": secret, "api_key": "k"}),
            snap("t", "function", SimpleNamespace(name="t", input=f'{{"q": "{secret}"}}', output=f"mail bob@x.io {secret}", mcp_data=None), parent="a"),
        ]
        rec = make_record(input={"messages": [{"content": secret}]}, output={"text": f"call 415-555-0199 {secret}"}, metadata={"token": secret, "free": secret})
        body = json.dumps(build_payload(rec, snaps))
        assert secret not in body
        assert "bob@x.io" not in body
        assert "415-555-0199" not in body

    def test_task_wrapper_is_collapsed_and_turns_are_chains(self):
        snaps = [
            snap("task", "task", SimpleNamespace(name="portfolio_text_response", usage=None),
                 started="2026-09-10T10:00:00.000+00:00", ended="2026-09-10T10:00:09.000+00:00"),
            snap("agent", "agent", SimpleNamespace(name="portfolio_agent"), parent="task",
                 started="2026-09-10T10:00:00.001+00:00", ended="2026-09-10T10:00:09.000+00:00"),
            snap("turn1", "turn", SimpleNamespace(turn=1, agent_name="portfolio_agent", usage={"input_tokens": 5, "output_tokens": 1, "total_tokens": 6}, metadata=None),
                 parent="agent", started="2026-09-10T10:00:00.002+00:00"),
            snap("llm", "response", response_data("hi"), parent="turn1", started="2026-09-10T10:00:00.003+00:00"),
            snap("inner_task", "task", SimpleNamespace(name="guardrail", usage=None), parent="agent",
                 started="2026-09-10T10:00:00.004+00:00"),
            snap("judge", "agent", SimpleNamespace(name="Security Guardrail"), parent="inner_task",
                 started="2026-09-10T10:00:00.005+00:00"),
        ]
        payload = build_payload(make_record(), snaps)
        assert_matches_contract(payload)
        spans = {s["name"]: s for s in payload["trace"]["spans"]}
        assert "task" not in spans and "guardrail" not in spans
        assert spans["portfolio_agent"]["parentSpanId"] is None
        turn = spans["turn 1"]
        assert turn["kind"] == "chain" and turn["parentSpanId"] == spans["portfolio_agent"]["id"]
        assert turn["attributes"]["agent.name"] == "portfolio_agent"
        assert turn["usage"] == {"inputTokens": 5, "outputTokens": 1, "totalTokens": 6}
        assert spans["gpt-5.6-terra-2026"]["parentSpanId"] == turn["id"]
        # Re-parented across the dropped inner task straight to the agent.
        assert spans["Security Guardrail"]["parentSpanId"] == spans["portfolio_agent"]["id"]
        # Trace usage counts llm spans only, never the turn's aggregate.
        assert payload["trace"]["usage"] == {"inputTokens": 100, "outputTokens": 20, "totalTokens": 120}

    def test_llm_span_without_a_response_is_unset(self):
        snaps = [snap("r", "response", SimpleNamespace(response=None, input=None, usage=None))]
        span = build_payload(make_record(), snaps)["trace"]["spans"][0]
        assert span["status"] == "unset"
        assert build_payload(make_record(), snaps)["trace"]["status"] == "ok"

    def test_metadata_and_attributes_are_bounded(self):
        big = {"retell.metadata": {"junk": ["x" * 9000] * 120}, "mode": "voice"}
        snaps = [snap("a", "agent", SimpleNamespace(name="portfolio_agent"), extra={"blob": ["y" * 9000] * 20, "small": 1})]
        payload = build_payload(make_record(metadata=big), snaps)
        assert_matches_contract(payload)
        trace = payload["trace"]
        assert isinstance(trace["metadata"], dict)
        assert len(json.dumps(trace["metadata"]).encode()) <= firetrace.MAX_TRACE_FIELD_BYTES + 200
        assert trace["metadata"]["mode"] == "voice"
        assert "retell.metadata" in trace["metadata"]["firetrace.dropped"]
        attrs = trace["spans"][0]["attributes"]
        assert isinstance(attrs, dict) and attrs["small"] == 1
        assert len(json.dumps(attrs).encode()) <= firetrace.MAX_SPAN_FIELD_BYTES + 200
        assert "blob" in attrs["firetrace.dropped"]

    def test_fit_request_shrinks_metadata_before_dropping_spans(self):
        rec = make_record(metadata={f"k{i}": "x" * 9000 for i in range(300)})
        snaps = [snap("a", "agent", SimpleNamespace(name="portfolio_agent"))]
        payload = build_payload(rec, snaps)
        assert_matches_contract(payload)
        assert len(json.dumps(payload).encode()) <= 2 * 1024 * 1024
        assert len(payload["trace"]["spans"]) == 1

    def test_refusal_parts_are_kept(self):
        data = response_data("")
        data.response.output.append(
            SimpleNamespace(type="message", content=[SimpleNamespace(refusal="I can't help with that")])
        )
        span = build_payload(make_record(), [snap("r", "response", data)])["trace"]["spans"][0]
        assert span["output"]["refusal"] == "I can't help with that"
        assert span["status"] == "ok"

    def test_bare_sdk_trace_id_is_reused(self):
        assert firetrace._trace_id_from_sdk("trace_" + "AB" * 16) == "ab" * 16
        assert HEX32.match(firetrace._trace_id_from_sdk("no-op"))


# ---------------------------------------------------------------------------
# Sending and retry policy
# ---------------------------------------------------------------------------


class TestSendWithRetry:
    @pytest.fixture(autouse=True)
    def no_sleep(self, monkeypatch):
        monkeypatch.setattr(firetrace.time, "sleep", lambda s: None)

    def run(self, monkeypatch, outcomes, caplog):
        calls = []

        def fake_deliver(body, api_key, timeout=None):
            outcome = outcomes[min(len(calls), len(outcomes) - 1)]
            calls.append(api_key)
            if isinstance(outcome, BaseException):
                raise outcome
            return outcome

        monkeypatch.setattr(firetrace, "_deliver", fake_deliver)
        with caplog.at_level("INFO", logger="firetrace"):
            ok = send_with_retry(b"{}", FAKE_KEY, "t" * 32, 3)
        assert FAKE_KEY not in caplog.text
        return ok, len(calls)

    def test_201_once(self, monkeypatch, caplog):
        ok, n = self.run(monkeypatch, [(201, {"projectId": "p"})], caplog)
        assert ok and n == 1
        assert "recorded trace" in caplog.text and "/projects/p/traces/" in caplog.text

    def test_200_duplicate_once_with_warning(self, monkeypatch, caplog):
        ok, n = self.run(monkeypatch, [(200, {"duplicate": True})], caplog)
        assert ok and n == 1
        assert "duplicate=True" in caplog.text

    @pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 413])
    def test_client_errors_are_not_retried(self, monkeypatch, caplog, status):
        body = {"error": {"code": "invalid_trace", "message": "trace.spans[0].kind", "requestId": "rq"}}
        ok, n = self.run(monkeypatch, [(status, body), (201, {})], caplog)
        assert not ok and n == 1
        assert "not retrying" in caplog.text and "invalid_trace" in caplog.text and "rq" in caplog.text

    def test_429_then_201(self, monkeypatch, caplog):
        ok, n = self.run(monkeypatch, [(429, {"error": {"code": "quota_exhausted"}}), (201, {})], caplog)
        assert ok and n == 2

    def test_5xx_then_201(self, monkeypatch, caplog):
        ok, n = self.run(monkeypatch, [(503, None), (500, {}), (201, {})], caplog)
        assert ok and n == 3

    def test_network_error_then_201(self, monkeypatch, caplog):
        ok, n = self.run(monkeypatch, [urllib.error.URLError("dns"), TimeoutError(), (201, {})], caplog)
        assert ok and n == 3

    def test_gives_up_after_backoff_without_raising(self, monkeypatch, caplog):
        ok, n = self.run(monkeypatch, [(502, None)], caplog)
        assert not ok and n == 5
        assert "not recorded after 5 attempt(s)" in caplog.text

    def test_unexpected_errors_are_not_retried(self, monkeypatch, caplog):
        ok, n = self.run(monkeypatch, [RuntimeError("bug in the sender"), (201, {})], caplog)
        assert not ok and n == 1
        assert "unexpected error RuntimeError" in caplog.text

    def test_single_quick_attempt_while_stopping(self, monkeypatch, caplog):
        seen = []

        def fake_deliver(body, api_key, timeout=None):
            seen.append(timeout)
            raise urllib.error.URLError("down")

        monkeypatch.setattr(firetrace, "_deliver", fake_deliver)
        stop = threading.Event()
        stop.set()
        with caplog.at_level("WARNING", logger="firetrace"):
            ok = send_with_retry(b"{}", FAKE_KEY, "t" * 32, 0, stop_event=stop)
        assert not ok and seen == [firetrace._SHUTDOWN_SEND_TIMEOUT_SECONDS]
        assert "after 1 attempt(s)" in caplog.text

    def test_deliver_builds_the_request(self, monkeypatch):
        seen = {}

        class Resp:
            status = 201

            def read(self):
                return b'{"ok": true}'

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def fake_urlopen(req, timeout):
            seen["req"] = req
            seen["timeout"] = timeout
            return Resp()

        monkeypatch.setattr(firetrace.urllib.request, "urlopen", fake_urlopen)
        status, data = REAL_DELIVER(b'{"schemaVersion":1}', FAKE_KEY)
        req = seen["req"]
        assert status == 201 and data == {"ok": True}
        assert req.full_url == "https://tracing.art3m1s.me/api/v1/traces"
        assert req.get_method() == "POST"
        assert req.get_header("Authorization") == f"Bearer {FAKE_KEY}"
        assert req.get_header("Content-type") == "application/json"
        assert req.data == b'{"schemaVersion":1}'
        assert seen["timeout"] == firetrace._SEND_TIMEOUT_SECONDS

    def test_deliver_returns_http_error_bodies(self, monkeypatch):
        def fake_urlopen(req, timeout):
            raise urllib.error.HTTPError(
                req.full_url, 400, "Bad Request", {}, __import__("io").BytesIO(b'{"error":{"code":"invalid_trace"}}')
            )

        monkeypatch.setattr(firetrace.urllib.request, "urlopen", fake_urlopen)
        status, data = REAL_DELIVER(b"{}", FAKE_KEY)
        assert status == 400 and data["error"]["code"] == "invalid_trace"


# ---------------------------------------------------------------------------
# End to end through the Agents SDK tracing API
# ---------------------------------------------------------------------------


class TestProcessor:
    def test_run_with_nested_spans_is_exported_once(self, key, only_firetrace, sent):
        with traced_run(
            "portfolio_text_response",
            session_id="text-abc",
            model="gpt-5.6-terra",
            input={"messages": [{"role": "user", "content": "hi"}]},
            metadata={"mode": "text"},
            tags=("text",),
        ) as run:
            assert HEX32.match(run.trace_id)
            with agent_span(name="portfolio_agent", tools=["search_projects"]):
                with step("embed-query", kind="embedding", provider="openai", model="m", input="hi") as s:
                    s["output"] = {"dimensions": 3}
                    s["usage"] = {"inputTokens": 2, "totalTokens": 2}
                    annotate(**{"custom.note": "x"})
            run.set_output({"text": "hello"})
        flush()

        assert len(sent.bodies) == 1
        payload = sent.bodies[0]
        assert_matches_contract(payload)
        trace = payload["trace"]
        assert trace["id"] == run.trace_id
        assert trace["name"] == "portfolio_text_response"
        assert trace["sessionId"] == "text-abc"
        assert trace["model"] == "gpt-5.6-terra"
        assert trace["input"] == {"messages": [{"role": "user", "content": "hi"}]}
        assert trace["output"] == {"text": "hello"}
        assert trace["tags"] == ["text"]
        assert trace["status"] == "ok"
        assert trace["metadata"]["mode"] == "text"
        for span in trace["spans"]:
            assert trace["startedAt"] <= span["startedAt"]
            assert trace["endedAt"] >= span["endedAt"]
        # Creation order is kept even when the clock cannot tell the two apart.
        agent, embed = trace["spans"]
        assert agent["kind"] == "agent" and agent["parentSpanId"] is None
        assert agent["attributes"]["agent.tools"] == ["search_projects"]
        assert embed["kind"] == "embedding" and embed["parentSpanId"] == agent["id"]
        assert embed["usage"] == {"inputTokens": 2, "totalTokens": 2}
        assert embed["attributes"]["custom.note"] == "x"

    def test_send_runs_on_the_export_thread(self, key, only_firetrace, sent):
        with traced_run("r"):
            pass
        flush()
        assert sent.threads == ["firetrace-export"]

    def test_guardrail_exception_is_a_refusal_not_an_error(self, key, only_firetrace, sent):
        class InputGuardrailTripwireTriggered(Exception):
            pass

        with pytest.raises(InputGuardrailTripwireTriggered):
            with traced_run("voice", session_id="call_1"):
                raise InputGuardrailTripwireTriggered("nope")
        flush()
        trace = sent.bodies[0]["trace"]
        assert trace["status"] == "ok"
        assert "guardrail-blocked" in trace["tags"]

    def test_call_site_marks_refusal_with_output(self, key, only_firetrace, sent):
        with traced_run("voice") as run:
            run.mark_guardrail_blocked(output={"text": "refused"})
        flush()
        trace = sent.bodies[0]["trace"]
        assert trace["output"] == {"text": "refused"}
        assert "guardrail-blocked" in trace["tags"]

    def test_other_exceptions_mark_the_trace_error(self, key, only_firetrace, sent):
        with pytest.raises(ValueError):
            with traced_run("voice"):
                raise ValueError("boom")
        flush()
        trace = sent.bodies[0]["trace"]
        assert trace["status"] == "error"
        assert trace["metadata"]["error.type"] == "ValueError"
        assert trace["metadata"]["error.message"] == "boom"

    def test_set_error_from_call_site(self, key, only_firetrace, sent):
        with traced_run("voice") as run:
            run.set_error(RuntimeError("x"))
        flush()
        assert sent.bodies[0]["trace"]["status"] == "error"

    def test_abandoned_stream_is_tagged(self, key, only_firetrace, sent):
        with pytest.raises(GeneratorExit):
            with traced_run("voice"):
                raise GeneratorExit()
        flush()
        trace = sent.bodies[0]["trace"]
        assert trace["status"] == "ok" and "abandoned" in trace["tags"]

    def test_cancelled_run_is_tagged(self, key, only_firetrace, sent):
        import asyncio

        with pytest.raises(asyncio.CancelledError):
            with traced_run("voice"):
                raise asyncio.CancelledError()
        flush()
        trace = sent.bodies[0]["trace"]
        assert trace["status"] == "ok" and "cancelled" in trace["tags"]

    def test_nothing_is_sent_without_a_key(self, monkeypatch, only_firetrace, sent):
        monkeypatch.delenv(firetrace.API_KEY_ENV, raising=False)
        with traced_run("voice") as run:
            assert run.trace_id is None
            with agent_span(name="a"):
                pass
            run.set_output("ignored")
        flush()
        assert sent.bodies == []
        assert firetrace._PROCESSOR._runs == {}

    def test_blank_key_counts_as_unset(self, monkeypatch, only_firetrace, sent):
        monkeypatch.setenv(firetrace.API_KEY_ENV, "   ")
        with traced_run("voice"):
            pass
        flush()
        assert sent.bodies == []

    def test_bare_sdk_trace_is_still_recorded(self, key, only_firetrace, sent):
        with sdk_trace("Agent workflow", group_id="g1", metadata={"k": "v"}) as t:
            with agent_span(name="a"):
                pass
        flush()
        trace = sent.bodies[0]["trace"]
        assert_matches_contract(sent.bodies[0])
        assert trace["id"] == t.trace_id.removeprefix("trace_")
        assert trace["name"] == "Agent workflow"
        assert trace["sessionId"] == "g1"
        assert trace["metadata"]["k"] == "v"

    def test_step_outside_a_run_is_a_noop(self, only_firetrace, sent):
        with step("embed-query", kind="embedding") as s:
            s["output"] = 1
        assert s["kind"] == "embedding"
        with pytest.raises(RuntimeError):
            with step("x", kind="retriever"):
                raise RuntimeError("propagates")
        flush()
        assert sent.bodies == []

    def test_step_records_failures_as_error_spans(self, key, only_firetrace, sent):
        with pytest.raises(RuntimeError):
            with traced_run("voice"):
                with step("pinecone.query", kind="retriever"):
                    raise RuntimeError("pinecone down")
        flush()
        trace = sent.bodies[0]["trace"]
        span = trace["spans"][0]
        assert span["status"] == "error"
        assert span["attributes"]["error.type"] == "RuntimeError"
        assert "pinecone down" in span["attributes"]["error.message"]
        assert trace["status"] == "error"

    def test_annotate_outside_a_span_is_harmless(self):
        annotate(a=1)

    def test_payload_failure_never_raises(self, key, only_firetrace, sent, monkeypatch, caplog):
        monkeypatch.setattr(firetrace, "build_payload", lambda *a: (_ for _ in ()).throw(RuntimeError("bad")))
        with caplog.at_level("WARNING", logger="firetrace"):
            with traced_run("voice"):
                pass
            flush()
        assert sent.bodies == []
        assert "could not build trace" in caplog.text

    def test_delivery_failure_never_raises(self, key, only_firetrace, monkeypatch, caplog):
        monkeypatch.setattr(firetrace.time, "sleep", lambda s: None)

        def explode(body, api_key, timeout=None):
            raise urllib.error.URLError("offline")

        monkeypatch.setattr(firetrace, "_deliver", explode)
        with caplog.at_level("WARNING", logger="firetrace"):
            with traced_run("voice"):
                pass
            flush()
        assert "not recorded after" in caplog.text
        assert FAKE_KEY not in caplog.text

    def test_export_waits_for_spans_still_open_when_the_trace_ends(self, key, only_firetrace, sent):
        """A barge-in ends the trace while the SDK run continues."""
        with traced_run("voice", session_id="call_1") as run:
            root = agent_span(name="portfolio_agent")
            root.start(mark_as_current=True)
            child = agent_span(name="still-running")
            child.start(mark_as_current=True)
        flush()
        assert sent.bodies == []  # nothing sent yet: two spans are still open
        record = only_firetrace.record_for("trace_" + run.trace_id)
        assert record is not None and record.closing
        child.finish(reset_current=True)
        flush()
        assert sent.bodies == []  # the root is still open
        root.finish(reset_current=True)
        flush()
        assert len(sent.bodies) == 1
        trace = sent.bodies[0]["trace"]
        assert_matches_contract(sent.bodies[0])
        assert {s["name"] for s in trace["spans"]} == {"portfolio_agent", "still-running"}
        assert all(s["status"] == "ok" for s in trace["spans"])
        assert all("firetrace.unfinished" not in (s.get("attributes") or {}) for s in trace["spans"])
        assert all(trace["endedAt"] >= s["endedAt"] for s in trace["spans"])
        assert only_firetrace.record_for("trace_" + run.trace_id) is None

    def test_abandoned_turn_keeps_spans_started_after_the_trace_ended(self, key, only_firetrace, sent):
        with pytest.raises(GeneratorExit):
            with traced_run("voice"):
                root = agent_span(name="portfolio_agent")
                root.start(mark_as_current=True)
                raise GeneratorExit()
        # The SDK loop keeps going: a later span starts and ends, then the root.
        late = agent_span(name="late-model-call", parent=root)
        late.start()
        late.finish()
        root.finish(reset_current=True)
        flush()
        trace = sent.bodies[0]["trace"]
        assert "abandoned" in trace["tags"]
        assert trace["metadata"]["run.abandoned_at"] <= trace["endedAt"]
        names = {s["name"] for s in trace["spans"]}
        assert names == {"portfolio_agent", "late-model-call"}
        late_span = next(s for s in trace["spans"] if s["name"] == "late-model-call")
        assert late_span["parentSpanId"] == next(s for s in trace["spans"] if s["name"] == "portfolio_agent")["id"]

    def test_grace_timer_exports_a_run_that_never_finishes(self, key, only_firetrace, sent, monkeypatch):
        monkeypatch.setattr(firetrace, "_CLOSE_GRACE_SECONDS", 0.2)
        with traced_run("voice") as run:
            stuck = agent_span(name="stuck")
            stuck.start(mark_as_current=True)
        deadline = __import__("time").time() + 5
        while not sent.bodies and __import__("time").time() < deadline:
            __import__("time").sleep(0.05)
        flush()
        assert len(sent.bodies) == 1
        span = sent.bodies[0]["trace"]["spans"][0]
        assert span["status"] == "unset" and span["attributes"]["firetrace.unfinished"] is True
        assert only_firetrace.record_for("trace_" + run.trace_id) is None
        stuck.finish(reset_current=True)  # a late end for an exported run is ignored
        flush()
        assert len(sent.bodies) == 1

    def test_shutdown_flushes_closing_runs_and_drops_in_progress_ones(self, key, only_firetrace, sent, caplog):
        processor = only_firetrace
        try:
            with traced_run("closing") as done:
                waiting = agent_span(name="waiting")
                waiting.start(mark_as_current=True)
            in_progress = traced_run("in-progress")
            in_progress.__enter__()
            with caplog.at_level("WARNING", logger="firetrace"):
                processor.shutdown()
            names = [b["trace"]["name"] for b in sent.bodies]
            assert names == ["closing"]
            assert processor.record_for("trace_" + done.trace_id) is None
            assert "1 run(s) were still in progress" in caplog.text
        finally:
            processor._stopping.clear()
            waiting.finish(reset_current=True)
            in_progress.__exit__(None, None, None)
            flush()

    def test_two_runs_get_distinct_ids(self, key, only_firetrace, sent):
        with traced_run("a") as r1:
            pass
        with traced_run("b") as r2:
            pass
        flush()
        assert r1.trace_id != r2.trace_id
        assert {b["trace"]["id"] for b in sent.bodies} == {r1.trace_id, r2.trace_id}

    def test_hooks_ignore_spans_of_untracked_traces(self, key, only_firetrace, sent):
        processor = firetrace._PROCESSOR
        stray = SimpleNamespace(trace_id="trace_unknown", span_id="s", parent_id=None)
        processor.on_span_start(stray)
        processor.on_span_end(stray)
        processor.on_trace_end(SimpleNamespace(trace_id="trace_unknown", name="x"))
        flush()
        assert sent.bodies == []


class TestCallSites:
    """The wiring in llm.py, summary.py, guardrail.py and project_search.py."""

    @pytest.mark.asyncio
    async def test_draft_response_records_request_and_result(self, key, only_firetrace, sent, mock_runner=None):
        from unittest.mock import MagicMock

        from custom_types import ResponseRequiredRequest, Utterance
        from llm import LlmClient

        with patch("llm.Agent"), patch("llm.Runner") as runner:
            client = LlmClient("call_xyz", mode="voice")
            client.call_details = {"agent_id": "agent_1", "call_type": "web_call", "metadata": {"platform": "web", "user_id": "u-7"}}
            delta = SimpleNamespace(type="response.output_text.delta", delta="Hi there")
            refusal = SimpleNamespace(type="response.refusal.delta", delta="nope")

            async def events():
                from agents import RawResponsesStreamEvent

                yield RawResponsesStreamEvent(data=delta)
                yield RawResponsesStreamEvent(data=refusal)

            stream = MagicMock()
            stream.stream_events = lambda: events()
            runner.run_streamed.return_value = stream
            request = ResponseRequiredRequest(
                interaction_type="response_required",
                response_id=3,
                transcript=[Utterance(role="user", content="Tell me about Bill; mail bob@x.io")],
            )
            out = [r async for r in client.draft_response(request)]
        flush()
        assert out[-1].content_complete is True
        trace = sent.bodies[0]["trace"]
        assert_matches_contract(sent.bodies[0])
        assert trace["name"] == "portfolio_voice_response"
        assert trace["sessionId"] == "call_xyz" and trace["userId"] == "u-7"
        assert trace["tags"] == ["voice", "response_required"]
        assert trace["input"]["transcript"][0]["content"] == "Tell me about Bill; mail [EMAIL]"
        assert trace["output"] == {"text": "Hi there", "refusal": "nope"}
        # The refusal delta is recorded on the trace but never spoken.
        assert [r.content for r in out if getattr(r, "content", None)] == ["Hi there"]
        assert trace["metadata"]["retell.agent_id"] == "agent_1"
        assert trace["metadata"]["retell.metadata"] == {"platform": "web", "user_id": "u-7"}
        assert trace["metadata"]["response_id"] == "3"

    @pytest.mark.asyncio
    async def test_draft_text_response_refusal(self, key, only_firetrace, sent):
        from llm import LlmClient
        from prompts import guardrail_refusal_message

        class InputGuardrailTripwireTriggered(Exception):
            pass

        with patch("llm.Agent"), patch("llm.Runner") as runner:
            runner.run_streamed.side_effect = InputGuardrailTripwireTriggered("nope")
            client = LlmClient("text-1", mode="text")
            out = [c async for c in client.draft_text_response([{"role": "user", "content": "do my homework"}])]
        flush()
        assert out[-1].type == "done"
        trace = sent.bodies[0]["trace"]
        assert trace["name"] == "portfolio_text_response"
        assert trace["status"] == "ok"
        assert "guardrail-blocked" in trace["tags"]
        assert trace["output"] == {"text": guardrail_refusal_message}
        assert trace["input"] == {"messages": [{"role": "user", "content": "do my homework"}]}

    @pytest.mark.asyncio
    async def test_draft_text_response_error(self, key, only_firetrace, sent):
        from llm import LlmClient

        with patch("llm.Agent"), patch("llm.Runner") as runner:
            runner.run_streamed.side_effect = RuntimeError("openai down")
            client = LlmClient("text-2", mode="text")
            out = [c async for c in client.draft_text_response([{"role": "user", "content": "hi"}])]
        flush()
        assert out[-1].type == "error"
        trace = sent.bodies[0]["trace"]
        assert trace["status"] == "error"
        assert trace["metadata"]["error.type"] == "RuntimeError"

    @pytest.mark.asyncio
    async def test_summary_records_transcript_and_summary(self, key, only_firetrace, sent):
        from custom_types import TextChatMessage
        from summary import generate_summary

        with patch("summary.Runner") as runner:
            async def run(agent, messages):
                return SimpleNamespace(final_output="## Cheat sheet")

            runner.run.side_effect = run
            result = await generate_summary([TextChatMessage(role="user", content="hello")])
        flush()
        assert result == "## Cheat sheet"
        trace = sent.bodies[0]["trace"]
        assert trace["name"] == "portfolio_summary_generation"
        assert trace["tags"] == ["summary"]
        assert trace["input"] == {"transcript": [{"role": "user", "content": "hello"}]}
        assert trace["output"] == {"summary": "## Cheat sheet"}
        assert "sessionId" not in trace

    @pytest.mark.asyncio
    async def test_search_projects_adds_embedding_and_retriever_spans(
        self, key, only_firetrace, sent, mock_openai_embeddings, mock_pinecone
    ):
        from project_search import search_projects

        with traced_run("voice"):
            with agent_span(name="portfolio_agent"):
                results = await search_projects("voice ai", top_k=3)
        flush()
        assert results and results[0]["id"] == "test-project"
        payload = sent.bodies[0]
        assert_matches_contract(payload)
        spans = {s["name"]: s for s in payload["trace"]["spans"]}
        agent = spans["portfolio_agent"]
        embed = spans["embed-query"]
        query = spans["pinecone.query"]
        assert embed["kind"] == "embedding" and embed["parentSpanId"] == agent["id"]
        assert embed["model"] == "text-embedding-3-large" and embed["input"] == "voice ai"
        assert embed["output"] == {"dimensions": 3072}
        assert "usage" not in embed  # the mocked response has no real usage numbers
        assert query["kind"] == "retriever" and query["parentSpanId"] == agent["id"]
        assert query["provider"] == "pinecone"
        assert query["output"] == [{"id": "test-project", "name": "Test Project", "score": 0.95}]
        assert query["attributes"] == {"index": "portfolio", "top_k": 3}

    @pytest.mark.asyncio
    async def test_guardrail_verdict_is_annotated_on_its_span(self, key, only_firetrace, sent):
        from agents.tracing import guardrail_span

        from guardrail import ScreeningDecision, security_guardrail

        with patch("guardrail.Runner") as runner:
            async def run(*a, **k):
                return SimpleNamespace(
                    final_output_as=lambda cls: ScreeningDecision(reasoning="about Bill", rule="Q3")
                )

            runner.run.side_effect = run
            with traced_run("voice"):
                with guardrail_span("security_guardrail") as gs:
                    out = await security_guardrail.guardrail_function(
                        SimpleNamespace(context=None), None, [{"role": "user", "content": "hi"}]
                    )
                    gs.span_data.triggered = out.tripwire_triggered
        flush()
        assert out.tripwire_triggered is False
        span = sent.bodies[0]["trace"]["spans"][0]
        assert span["name"] == "guardrail:security_guardrail"
        assert span["attributes"]["guardrail.rule"] == "Q3"
        assert span["attributes"]["guardrail.reasoning"] == "about Bill"
        assert span["attributes"]["guardrail.allowed"] is True
        assert span["attributes"]["guardrail.judged"] is True
        assert span["attributes"]["guardrail.triggered"] is False
