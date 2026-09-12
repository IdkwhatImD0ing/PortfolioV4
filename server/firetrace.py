"""FireTrace exporter: one trace per completed LLM or agent run.

FireTrace (https://tracing.art3m1s.me) is a self-hosted tracing service that
stores completed traces forever. This module records every run the OpenAI
Agents SDK executes on this server as one FireTrace trace, with one span per
meaningful step (agent, model call, guardrail, tool, embedding, retrieval).

How it fits together
--------------------
The Agents SDK already emits a span for every step it takes, with real start
and end timestamps, parent links and token usage. ``FireTraceProcessor`` is a
``TracingProcessor`` registered alongside the SDK's own OpenAI exporter, so
nothing here re-implements the run loop: it collects the SDK's spans per trace,
maps them onto FireTrace's wire format when the trace ends, and hands the
payload to a background thread that POSTs it with ``urllib`` (no dependency).

Call sites open a run with :func:`traced_run` instead of the SDK's bare
``trace()``; the handle it returns is where the request, the result, the
session id and the outcome are attached. :func:`step` adds a child span for a
step the SDK does not see (an embedding call, a vector-store query), and
:func:`annotate` attaches attributes to whichever SDK span is current (the
guardrail verdict, for instance).

Guarantees
----------
* Tracing can never break the app. Every hook and the sender catch everything,
  log a warning, and carry on. The send happens after the run has finished and
  off the event loop, so it never sits in front of the user's response.
* The key is read from ``FIRETRACE_API_KEY`` and is never logged. FireTrace
  stamps the environment server-side from the key, so no environment field is
  sent; each deployment scope holds its own key.
* Secrets and personal data (keys, tokens, emails, phone numbers, card and
  social-security numbers, IP addresses) are redacted from input, output,
  metadata and attributes before anything leaves the process.
* Only network errors, 429 and 5xx are retried, with backoff. Any other 4xx
  means the payload is wrong; it is logged, not retried.
* Payloads respect FireTrace's limits (200 spans, 2 MiB per request) by
  truncating content, never by failing.
"""

# Catching Exception broadly is this module's contract: nothing here may raise
# into the app, whatever the SDK, the network or a payload throws.
# ruff: noqa: BLE001

from __future__ import annotations

import asyncio
import atexit
import copy
import http.client
import json
import logging
import math
import os
import queue
import random
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from agents.tracing import (
    TracingProcessor,
    add_trace_processor,
    custom_span,
    get_current_span,
    get_current_trace,
)
from agents.tracing import trace as sdk_trace
from agents.tracing.spans import Span, SpanError
from agents.tracing.traces import Trace

__all__ = [
    "API_KEY_ENV",
    "INGEST_URL",
    "FireTraceProcessor",
    "RunHandle",
    "annotate",
    "build_payload",
    "enabled",
    "install",
    "redact",
    "redact_text",
    "send_with_retry",
    "step",
    "traced_run",
]

# The ingest endpoint is not a secret; the key is.
INGEST_URL = "https://tracing.art3m1s.me/api/v1/traces"
API_KEY_ENV = "FIRETRACE_API_KEY"
PROVIDER = "openai"

# FireTrace's hard limits (docs/ingestion-api), and the headroom we keep.
MAX_SPANS = 200
MAX_TAGS = 20
MAX_TAG_CHARS = 64
MAX_NAME_CHARS = 500
MAX_ID_FIELD_CHARS = 200
MAX_REQUEST_BYTES = 2 * 1024 * 1024
_TARGET_REQUEST_BYTES = 1_800_000
# FireTrace also caps each stored document (the trace without its spans, and
# each span) at 768,000 bytes. Kept well under: FireTrace also measures by
# Firestore's own accounting, which can exceed the JSON length.
_MAX_DOCUMENT_BYTES = 700_000
# Our own content caps, well under FireTrace's 750 KiB per stored document.
MAX_STRING_CHARS = 10_000
MAX_SPAN_FIELD_BYTES = 32_000
MAX_TRACE_FIELD_BYTES = 128_000
MAX_LIST_ITEMS = 100
MAX_DEPTH = 16
# Spans kept in memory per trace before we stop collecting (a runaway-loop
# guard; FireTrace itself takes at most MAX_SPANS).
_MAX_COLLECTED_SPANS = 1000

_SEND_TIMEOUT_SECONDS = 10.0
_RETRY_DELAYS_SECONDS = (0.5, 1.0, 2.0, 4.0)  # attempts = len + 1
_QUEUE_MAX = 256
# Traces waiting to be sent before each send gets one quick attempt instead
# of the full retry schedule (see FireTraceProcessor._hurry).
_HURRY_BACKLOG = 8
_SHUTDOWN_GRACE_SECONDS = 5.0
_SHUTDOWN_SEND_TIMEOUT_SECONDS = 2.0
# How long a run whose trace has ended may keep producing spans (a streamed
# turn the caller abandoned) before it is exported with what has finished.
_CLOSE_GRACE_SECONDS = 120.0

_KINDS = frozenset(
    {"llm", "agent", "tool", "chain", "retriever", "embedding", "reranker", "custom"}
)
_GUARDRAIL_TRIPWIRE_MESSAGE = "Guardrail tripwire triggered"

logger = logging.getLogger("firetrace")


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

# Values under these keys are dropped wholesale, whatever they contain. Keys
# are matched on whole words at the END of the key (its head noun: `api_key`,
# `clientSecret`, `X-Retell-Signature`), after splitting camelCase and
# punctuation into `_`-separated words. A bare substring match also hit
# `businessName` ("ssn"), `className`, `signature_url` and `cookieCount`.
_SECRET_KEY_RE = re.compile(
    r"(?:^|_)(?:api_?key|secret_?key|authorization|auth_?token|access_?token"
    r"|refresh_?token|id_?token|secrets?|password|passwd|cookies?|signature"
    r"|bearer|credentials?|private_?key|ssn|social_?security(?:_?number)?"
    r"|credit_?card(?:_?number)?|card_?number|cvv)$"
)
_CAMEL_RE = re.compile(r"([a-z0-9])([A-Z])")
_NON_WORD_RE = re.compile(r"[^A-Za-z0-9]+")


def _is_secret_key(key: str) -> bool:
    words = _NON_WORD_RE.sub("_", _CAMEL_RE.sub(r"\1_\2", key)).lower().strip("_")
    return bool(_SECRET_KEY_RE.search(words))

# Patterns applied to every string. Order matters: known key shapes before the
# generic long-token rule, and the generic rule before emails.
_STRING_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    # The body is bounded to PEM characters with a possessive quantifier: a
    # lazy `.*?` here rescans to the end of the string for every BEGIN marker
    # without an END, which is quadratic on hostile input.
    (
        re.compile(
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----[A-Za-z0-9+/=\s]*+-----END [A-Z ]*PRIVATE KEY-----"
        ),
        "[REDACTED_PRIVATE_KEY]",
    ),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9\-._~+/]+=*"), "Bearer [REDACTED]"),
    (re.compile(r"\bft_live_[0-9a-fA-F]{16}_[0-9a-fA-F]{64}\b"), "[REDACTED_KEY]"),
    (re.compile(r"\bsk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_\-]{16,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bpcsk_[A-Za-z0-9_\-]{10,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bkey_[0-9a-fA-F]{32}\b"), "[REDACTED_KEY]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_KEY]"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"), "[REDACTED_KEY]"),
    (re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"), "[REDACTED_KEY]"),
    (
        re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b"),
        "[REDACTED_JWT]",
    ),
    # A long run of hex is an opaque token (hash, secret), never prose. The
    # possessive quantifier keeps this linear on long runs (Python 3.11+).
    # An underscore is not a boundary: OpenAI's `resp_<48 hex>` / `msg_<hex>`
    # ids are identifiers the dashboard needs, not secrets (the keys that do
    # take that shape have their own rules above).
    (re.compile(r"(?<![A-Za-z0-9_])[A-Fa-f0-9]{40,}+(?![A-Za-z0-9_])"), "[REDACTED_TOKEN]"),
    # Local parts are at most 64 chars, and bounding them keeps the rule
    # linear on long alphanumeric runs that contain no '@'.
    (re.compile(r"[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,}"), "[EMAIL]"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    # North-American numbers only (3-3-4 digits, optional +1), with NANP's
    # rule that area code and exchange start with 2-9: that spares unix-second
    # timestamps (17xxxxxxxx) and other 10-digit ids that start with 0 or 1.
    # The trailing check refuses a digit continuation (versions, ticket
    # numbers, IPs) but lets a sentence-final period through.
    (
        re.compile(
            r"(?<![\w/.\-])(?:\+?\d{1,2}[\s.\-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.\-]?[2-9]\d{2}[\s.\-]?\d{4}(?!\w|[/.\-]\d)"
        ),
        "[PHONE]",
    ),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP]"),
)
# 13-19 digits with optional single separators; the pattern ends on a digit so
# the separator after the number is not swallowed ("[CARD] ok", not "[CARD]ok").
_CARD_RE = re.compile(r"(?<!\d)(?:\d[ \-]?){12,18}\d(?!\d)")
# A 40+ run of letters, digits and urlsafe punctuation is an opaque token
# when it mixes cases and carries digits; that requirement keeps long slugs,
# words and repeated characters. '/' is deliberately not part of a run, so
# URL paths (github.com/<user>/<repo>/...) survive; the price is that a
# standard-base64 secret containing '/' is not caught by this rule (the
# provider-specific rules above still are). The mixed-case check happens in
# Python rather than in lookaheads, which would be quadratic on long runs.
_LONG_RUN_RE = re.compile(r"(?<![A-Za-z0-9+/=_\-])[A-Za-z0-9_\-+=]{40,}+(?![A-Za-z0-9+/=_\-])")
# Bound the work per string: scan a little past what is kept (so a secret
# straddling the keep boundary is redacted before it is cut), drop the rest.
_MAX_SCAN_CHARS = MAX_STRING_CHARS + 4096


def _luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = ord(ch) - 48
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        alt = not alt
    return total % 10 == 0


def _redact_cards(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        digits = re.sub(r"\D", "", m.group(0))
        return "[CARD]" if _luhn_ok(digits) else m.group(0)

    return _CARD_RE.sub(repl, text)


def _redact_long_runs(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        run = m.group(0)
        if (
            any(c.isdigit() for c in run)
            and any(c.islower() for c in run)
            and any(c.isupper() for c in run)
        ):
            return "[REDACTED_TOKEN]"
        return run

    return _LONG_RUN_RE.sub(repl, text)


# Per-payload memo for redact_text, set by build_payload on the thread that
# builds. Every model call in a turn carries the whole conversation as its
# input, and the SDK shares the same str objects between them, so without it
# one turn redacts the same messages once per llm span.
_redact_memo = threading.local()


def redact_text(text: str) -> str:
    """Scrub secret- and PII-shaped substrings out of one string."""
    if not text:
        return text
    memo: dict[str, str] | None = getattr(_redact_memo, "cache", None)
    if memo is not None:
        hit = memo.get(text)
        if hit is not None:
            return hit
    original = text
    if len(text) > _MAX_SCAN_CHARS:
        text = text[:_MAX_SCAN_CHARS]
    text = _redact_cards(text)
    for pattern, replacement in _STRING_RULES:
        text = pattern.sub(replacement, text)
    text = _redact_long_runs(text)
    if memo is not None:
        memo[original] = text
    return text


_MAX_KEY_BYTES = 1000  # Firestore refuses field names over 1,500 bytes


def _safe_key(key: Any) -> str:
    """A Firestore-legal field name: non-empty, not ``__x__``, bounded."""
    k = _clean_text(str(key))
    if len(k.encode("utf-8")) > _MAX_KEY_BYTES:
        k = k.encode("utf-8")[:_MAX_KEY_BYTES].decode("utf-8", "ignore")
    if not k:
        return "_"
    if len(k) >= 4 and k.startswith("__") and k.endswith("__"):
        k = "_" + k.strip("_") + "_"
    return k


def _clean_text(text: str) -> str:
    """Make a str UTF-8 encodable: a lone surrogate (which ``json.loads`` lets
    through from a client body) would otherwise make serialization raise."""
    try:
        text.encode("utf-8")
        return text
    except UnicodeEncodeError:
        return text.encode("utf-8", "replace").decode("utf-8")


def _truncate_text(text: str, limit: int = MAX_STRING_CHARS) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit]}…[truncated {len(text) - limit} chars]"


def _jsonable(value: Any, depth: int = 0) -> Any:
    """Turn arbitrary Python objects into plain JSON values."""
    if depth > MAX_DEPTH:
        return "[nested too deep]"
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        return _clean_text(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return f"[{len(value)} bytes]"
    if isinstance(value, dict):
        return {_safe_key(k): _jsonable(v, depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(v, depth + 1) for v in value]
    dump = getattr(value, "model_dump", None)
    if callable(dump):
        try:
            return _jsonable(dump(mode="json"), depth + 1)
        except Exception as e:
            logger.debug("[firetrace] model_dump failed, using str(): %r", e)
    if hasattr(value, "__dataclass_fields__"):
        try:
            return _jsonable(
                {f: getattr(value, f) for f in value.__dataclass_fields__}, depth + 1
            )
        except Exception as e:
            logger.debug("[firetrace] dataclass dump failed, using str(): %r", e)
    return str(value)


def redact(value: Any) -> Any:
    """Return a JSON-safe copy of ``value`` with secrets and PII scrubbed.

    Values under secret-looking keys (``api_key``, ``authorization`` …) are
    replaced outright; every string is run through :func:`redact_text`; long
    strings and lists are capped so one turn cannot blow the payload budget.
    """
    return _redact_flagged(value)[0]


def _redact_flagged(value: Any) -> tuple[Any, bool]:
    """:func:`redact`, also reporting whether anything was cut for size."""
    flags = {"truncated": False}
    return _redact_json(_jsonable(value), flags), flags["truncated"]


def _redact_json(value: Any, flags: dict[str, bool]) -> Any:
    if isinstance(value, str):
        text = redact_text(value)
        if len(text) > MAX_STRING_CHARS:
            flags["truncated"] = True
        return _truncate_text(text)
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            # Keys can carry PII too ({"jane@x.com": ...}). Redact them, and
            # keep keys that redact to the same text apart, not overwritten.
            key = redact_text(k)
            if key in out:
                n = 2
                while f"{key}#{n}" in out:
                    n += 1
                key = f"{key}#{n}"
            out[key] = "[REDACTED]" if _is_secret_key(k) else _redact_json(v, flags)
        return out
    if isinstance(value, list):
        if len(value) > MAX_LIST_ITEMS:
            flags["truncated"] = True
            head = value[: MAX_LIST_ITEMS // 2]
            tail = value[-(MAX_LIST_ITEMS // 2) :]
            elided = len(value) - len(head) - len(tail)
            value = head + [f"…[{elided} more items elided]"] + tail
        return [_redact_json(v, flags) for v in value]
    return value


# ---------------------------------------------------------------------------
# Time, ids, sizes
# ---------------------------------------------------------------------------

_HEX32 = re.compile(r"^[0-9a-f]{32}$")


def _now_iso() -> str:
    # Same shape and precision as the SDK's span timestamps, so the two sort
    # and compare consistently.
    return datetime.now(UTC).isoformat()


_TS_MAX = datetime.max.replace(tzinfo=UTC)


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _ts_before(a: str, b: str) -> bool:
    """True when timestamp ``a`` is strictly earlier than ``b``."""
    pa, pb = _parse_ts(a), _parse_ts(b)
    if pa is not None and pb is not None:
        return pa < pb
    return a < b


def _new_trace_id() -> str:
    return secrets.token_hex(16)


def _trace_id_from_sdk(sdk_trace_id: str) -> str:
    """The SDK's ``trace_<32hex>`` becomes FireTrace's 32-hex id."""
    raw = (sdk_trace_id or "").removeprefix("trace_").lower()
    return raw if _HEX32.match(raw) else _new_trace_id()


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _byte_len(value: Any) -> int:
    return len(_dumps(value).encode("utf-8"))


def _shrink(value: Any, max_bytes: int) -> tuple[Any, bool]:
    """Bound a JSON value to ``max_bytes`` serialized, keeping it readable."""
    if _byte_len(value) <= max_bytes:
        return value, False
    if isinstance(value, dict):
        # Run inputs wrap their message list ({"messages": [...]},
        # {"transcript": [...]}); trim the list inside and keep the wrapper.
        lists = [k for k, v in value.items() if isinstance(v, list) and len(v) > 3]
        if len(lists) == 1:
            key = lists[0]
            rest = {k: v for k, v in value.items() if k != key}
            budget = max_bytes - _byte_len(rest) - _byte_len(key) - 2
            inner, _ = _shrink(value[key], budget) if budget > 0 else (None, True)
            if isinstance(inner, list):
                shrunk = {**value, key: inner}
                if _byte_len(shrunk) <= max_bytes:
                    return shrunk, True
    if isinstance(value, list) and len(value) > 3:
        # Message lists: keep the opening turns and as many recent ones as
        # fit. Each item is serialized once, so this is linear in the list.
        sizes = [_byte_len(item) + 1 for item in value]  # +1: the comma
        head = value[:2]
        used = 2 + sum(sizes[:2]) + 48  # brackets, head, the elision marker
        keep = 0
        for size in reversed(sizes[2:]):
            if used + size > max_bytes:
                break
            used += size
            keep += 1
        tail = value[len(value) - max(keep, 1) :]
        elided = len(value) - len(head) - len(tail)
        shrunk = head + ([f"…[{elided} items elided for size]"] if elided else []) + tail
        if _byte_len(shrunk) <= max_bytes:
            return shrunk, True
    return _cut_text(_dumps(value), max_bytes), True


def _cut_text(text: str, max_bytes: int) -> str:
    """Cut ``text`` so its JSON encoding fits ``max_bytes`` of UTF-8.

    Counts bytes, not characters (an emoji is 4 bytes), and includes the
    escaping the text gets when it is serialized again as a string value.
    """
    suffix = f"…[truncated; {len(text)} chars total]"
    raw = text.encode("utf-8")
    room = max_bytes - len(suffix.encode("utf-8")) - 2
    while True:
        cut = raw[: max(0, room)].decode("utf-8", "ignore") + suffix
        over = _byte_len(cut) - max_bytes
        # Dropping `over` raw bytes drops at least `over` serialized bytes,
        # so this settles on the second pass.
        if over <= 0 or room <= 0:
            return cut
        room -= over


def _clip(value: Any, limit: int) -> str:
    """A bounded string field (name, id, tag): encodable, and at most ``limit``
    UTF-16 units, the length FireTrace's validator counts."""
    text = _clean_text(str(value))[:limit]
    while len(text.encode("utf-16-le")) > 2 * limit:
        text = text[:-1]
    return text


# ---------------------------------------------------------------------------
# Run records and the handle call sites hold
# ---------------------------------------------------------------------------


@dataclass
class _RunRecord:
    sdk_trace_id: str
    trace_id: str
    name: str
    session_id: str | None = None
    user_id: str | None = None
    model: str | None = None
    provider: str | None = PROVIDER
    input: Any = None
    output: Any = None
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    started_at: str | None = None
    ended_at: str | None = None
    error: tuple[str, str] | None = None
    guardrail_blocked: bool = False
    abandoned: bool = False
    cancelled: bool = False
    spans: list[Span[Any]] = field(default_factory=list)
    span_attrs: dict[str, dict[str, Any]] = field(default_factory=dict)
    dropped_spans: int = 0
    # Set when the run's trace has ended; the record then waits for its open
    # spans (see FireTraceProcessor._close) before it is exported.
    closing: bool = False
    closed_at: str | None = None
    timer: Any = field(default=None, repr=False)


@dataclass
class _SpanSnapshot:
    id: str
    parent_id: str | None
    started_at: str | None
    ended_at: str | None
    type: str
    data: Any
    error: SpanError | None
    extra: dict[str, Any]
    # Creation order. Wall-clock timestamps can tie (Windows ticks are coarse),
    # and a tie must not reorder a parent after its child.
    seq: int = 0


class RunHandle:
    """What :func:`traced_run` gives the call site.

    Everything here is best-effort and never raises: the run's outcome must not
    depend on the tracer.
    """

    def __init__(self, record: _RunRecord | None):
        self._record = record

    @property
    def trace_id(self) -> str | None:
        return self._record.trace_id if self._record else None

    def set_input(self, value: Any) -> None:
        if self._record is not None:
            self._record.input = value

    def set_output(self, value: Any) -> None:
        if self._record is not None:
            self._record.output = value

    def add_tag(self, tag: str) -> None:
        if self._record is not None and tag and tag not in self._record.tags:
            self._record.tags.append(str(tag))

    def set_metadata(self, **values: Any) -> None:
        if self._record is not None:
            self._record.metadata.update(values)

    def set_session(
        self, session_id: str | None = None, user_id: str | None = None
    ) -> None:
        if self._record is None:
            return
        if session_id:
            self._record.session_id = str(session_id)
        if user_id:
            self._record.user_id = str(user_id)

    def set_error(self, error: BaseException | str) -> None:
        if self._record is None:
            return
        if isinstance(error, BaseException):
            self._record.error = (type(error).__name__, str(error))
        else:
            self._record.error = ("Error", str(error))

    def mark_guardrail_blocked(self, output: Any = None) -> None:
        """The run ended because the input guardrail refused the turn."""
        if self._record is None:
            return
        self._record.guardrail_blocked = True
        if output is not None:
            self._record.output = output


# ---------------------------------------------------------------------------
# The processor
# ---------------------------------------------------------------------------


def enabled() -> bool:
    """True when a FireTrace key is present in the environment."""
    return bool(os.environ.get(API_KEY_ENV, "").strip())


def _api_key() -> str | None:
    key = os.environ.get(API_KEY_ENV, "").strip()
    return key or None


class FireTraceProcessor(TracingProcessor):
    """Collects the SDK's spans per trace and exports each finished trace."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._runs: dict[str, _RunRecord] = {}
        # Two stages. The build thread turns each finished run into a bounded
        # request body straight away, releasing the SDK objects and the
        # conversation it holds; the send thread then holds only those bytes
        # while it waits on the network.
        self._queue: queue.Queue[Any] = queue.Queue(maxsize=_QUEUE_MAX)
        self._send_queue: queue.Queue[Any] = queue.Queue(maxsize=_QUEUE_MAX)
        self._builder: threading.Thread | None = None
        self._worker: threading.Thread | None = None
        self._worker_lock = threading.Lock()
        self._pending = 0  # traces queued or in flight; guarded by _worker_lock
        self._stopping = threading.Event()

    # -- registration from traced_run ------------------------------------

    def register(self, record: _RunRecord) -> None:
        with self._lock:
            self._runs[record.sdk_trace_id] = record

    def record_for(self, sdk_trace_id: str) -> _RunRecord | None:
        with self._lock:
            return self._runs.get(sdk_trace_id)

    def finish_if_pending(self, sdk_trace_id: str) -> None:
        """Close a run whose SDK trace never reported its end (tracing off)."""
        with self._lock:
            record = self._runs.get(sdk_trace_id)
            if record is None or record.closing:
                return
        self._close(sdk_trace_id)

    # -- TracingProcessor hooks (must never raise) ------------------------

    def on_trace_start(self, trace: Trace) -> None:
        try:
            if not enabled():
                return
            with self._lock:
                record = self._runs.get(trace.trace_id)
                if record is None:
                    # A run opened with the SDK's bare trace(); still record it.
                    record = _RunRecord(
                        sdk_trace_id=trace.trace_id,
                        trace_id=_trace_id_from_sdk(trace.trace_id),
                        name=trace.name or "run",
                        session_id=getattr(trace, "group_id", None),
                        metadata=dict(getattr(trace, "metadata", None) or {}),
                    )
                    self._runs[trace.trace_id] = record
                if record.started_at is None:
                    record.started_at = _now_iso()
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("[firetrace] on_trace_start failed: %r", e)

    def on_trace_end(self, trace: Trace) -> None:
        try:
            self._close(trace.trace_id)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("[firetrace] on_trace_end failed: %r", e)

    def on_span_start(self, span: Span[Any]) -> None:
        try:
            with self._lock:
                record = self._runs.get(span.trace_id)
                if record is None:
                    return
                if len(record.spans) >= _MAX_COLLECTED_SPANS:
                    record.dropped_spans += 1
                    return
                record.spans.append(span)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("[firetrace] on_span_start failed: %r", e)

    def on_span_end(self, span: Span[Any]) -> None:
        """Export a closing run once its last open span has ended."""
        try:
            with self._lock:
                record = self._runs.get(span.trace_id)
                if record is None or not record.closing:
                    return
                if any(s.ended_at is None for s in record.spans):
                    return
                self._runs.pop(span.trace_id, None)
                timer, record.timer = record.timer, None
                record.ended_at = _now_iso()
            if timer is not None:
                timer.cancel()
            self._finish(record)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("[firetrace] on_span_end failed: %r", e)

    def shutdown(self) -> None:
        """Flush what can be flushed before the process exits.

        Runs whose trace has ended but that were still waiting for background
        spans are exported as they stand; runs still in progress are dropped
        (they never completed). The worker gets one quick attempt per trace.
        Runs once: our atexit hook and the SDK's both call it.
        """
        try:
            if self._stopping.is_set():
                return
            self._stopping.set()
            with self._lock:
                pending = list(self._runs.values())
                self._runs.clear()
            in_progress = 0
            for record in pending:
                if record.timer is not None:
                    record.timer.cancel()
                    record.timer = None
                if not record.closing:
                    in_progress += 1
                    continue
                record.ended_at = _now_iso()
                self._finish(record)
            if in_progress:
                logger.warning(
                    "[firetrace] %d run(s) were still in progress at exit and were not recorded",
                    in_progress,
                )
            self._stop_workers(timeout=_SHUTDOWN_GRACE_SECONDS)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("[firetrace] shutdown failed: %r", e)

    def force_flush(self) -> None:
        try:
            deadline = time.monotonic() + _SHUTDOWN_GRACE_SECONDS
            while (
                self._queue.unfinished_tasks or self._send_queue.unfinished_tasks
            ) and time.monotonic() < deadline:
                time.sleep(0.05)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("[firetrace] force_flush failed: %r", e)

    # -- annotation from inside a span --------------------------------------

    def annotate_span(self, span: Span[Any], attrs: dict[str, Any]) -> None:
        with self._lock:
            record = self._runs.get(span.trace_id)
            if record is None:
                return
            record.span_attrs.setdefault(span.span_id, {}).update(attrs)

    # -- export ------------------------------------------------------------

    def _close(self, sdk_trace_id: str) -> None:
        """The run's trace has ended: export now, or once its open spans end.

        A streamed turn the caller stopped consuming (a Retell barge-in) ends
        its trace while the SDK's run loop is still going. Exporting at that
        moment would drop every span the loop still produces and under-count
        the turn's usage, so the run stays registered until its last open span
        ends, with a timer as the fallback for a loop that never finishes.
        """
        timer: threading.Timer | None = None
        to_export: _RunRecord | None = None
        with self._lock:
            record = self._runs.get(sdk_trace_id)
            if record is None or record.closing:
                return
            record.closing = True
            record.closed_at = _now_iso()
            if any(s.ended_at is None for s in record.spans):
                timer = threading.Timer(
                    _CLOSE_GRACE_SECONDS, self._export_pending, args=(sdk_trace_id,)
                )
                timer.daemon = True
                record.timer = timer
            else:
                self._runs.pop(sdk_trace_id, None)
                record.ended_at = record.closed_at
                to_export = record
        if timer is not None:
            timer.start()
        elif to_export is not None:
            self._finish(to_export)

    def _export_pending(self, sdk_trace_id: str) -> None:
        """Grace period over: export the run with whatever has ended."""
        with self._lock:
            record = self._runs.pop(sdk_trace_id, None)
        if record is not None:
            record.timer = None
            record.ended_at = _now_iso()
            self._finish(record)

    def _finish(self, record: _RunRecord) -> None:
        record.ended_at = record.ended_at or _now_iso()
        if record.started_at is None:
            record.started_at = record.ended_at
        # Snapshot here: the workers never read a live SDK object. Each span's
        # data is copied (its attributes, one level deep), because a run
        # exported while spans are still open (the grace timer, shutdown) is
        # otherwise read by the build thread while the run loop writes to it.
        snapshots: list[_SpanSnapshot] = []
        for seq, span in enumerate(record.spans):
            try:
                snapshots.append(
                    _SpanSnapshot(
                        id=span.span_id,
                        parent_id=span.parent_id,
                        started_at=span.started_at,
                        ended_at=span.ended_at,
                        type=getattr(span.span_data, "type", "custom"),
                        data=_copy_span_data(span.span_data),
                        error=span.error,
                        extra=dict(record.span_attrs.get(span.span_id, {})),
                        seq=seq,
                    )
                )
            except Exception as e:
                logger.debug("[firetrace] skipping unreadable span: %r", e)
                continue
        record.spans = []
        with self._worker_lock:
            self._pending += 1
        try:
            self._queue.put_nowait((record, snapshots))
        except queue.Full:
            self._done_one()
            logger.warning(
                "[firetrace] export queue full; dropping trace %s", record.trace_id
            )
            return
        self._ensure_workers()

    def _ensure_workers(self) -> None:
        with self._worker_lock:
            if self._builder is None or not self._builder.is_alive():
                self._builder = threading.Thread(
                    target=self._run_builder, name="firetrace-build", daemon=True
                )
                self._builder.start()
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(
                    target=self._run_sender, name="firetrace-export", daemon=True
                )
                self._worker.start()

    def _stop_workers(self, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        with self._worker_lock:
            threads = ((self._builder, self._queue), (self._worker, self._send_queue))
        # Builder first, so what it still builds is queued ahead of the
        # sender's stop signal.
        for thread, q in threads:
            if thread is None or not thread.is_alive():
                continue
            try:
                q.put_nowait(None)
            except queue.Full:
                logger.debug("[firetrace] queue full at shutdown; not waiting for it")
            thread.join(max(0.0, deadline - time.monotonic()))
        with self._worker_lock:
            left = self._pending
        if left > 0:
            logger.warning(
                "[firetrace] %d trace(s) were still queued at exit and were not sent",
                left,
            )

    def _done_one(self) -> None:
        with self._worker_lock:
            self._pending -= 1

    def _run_builder(self) -> None:
        while True:
            job = self._queue.get()
            try:
                if job is None:
                    return
                if not self._hand_to_sender(*job):
                    self._done_one()
            except Exception as e:
                logger.warning("[firetrace] export failed: %r", e)
                self._done_one()
            finally:
                self._queue.task_done()

    def _hand_to_sender(self, record: _RunRecord, snapshots: list[_SpanSnapshot]) -> bool:
        """Build one run's request body and queue it; False when dropped."""
        if not _api_key():
            return False
        try:
            payload = build_payload(record, snapshots)
            body = _dumps(payload).encode("utf-8")
        except Exception as e:
            # Never %r here: an encoding error's repr embeds the whole body.
            logger.warning(
                "[firetrace] could not build trace %s: %s: %s",
                record.trace_id,
                type(e).__name__,
                str(e)[:300],
            )
            return False
        job = (body, record.trace_id, len(payload["trace"].get("spans", [])))
        try:
            self._send_queue.put_nowait(job)
        except queue.Full:
            logger.warning("[firetrace] send queue full; dropping trace %s", record.trace_id)
            return False
        return True

    def _run_sender(self) -> None:
        while True:
            job = self._send_queue.get()
            try:
                if job is None:
                    return
                body, trace_id, span_count = job
                api_key = _api_key()
                if api_key:
                    send_with_retry(body, api_key, trace_id, span_count, hurry=self._hurry)
            except Exception as e:
                logger.warning("[firetrace] export failed: %r", e)
            finally:
                if job is not None:
                    self._done_one()
                self._send_queue.task_done()

    def _hurry(self) -> bool:
        """One quick attempt per trace: the process is exiting, or a backlog
        has built up behind a failing endpoint (a retried send can hold the
        sender for a minute, and everything behind it waits)."""
        return self._stopping.is_set() or self._send_queue.qsize() >= _HURRY_BACKLOG


def _copy_span_data(data: Any) -> Any:
    """A copy of an SDK span-data object, containers one level deep."""
    try:
        snap = copy.copy(data)
        for name in getattr(type(data), "__slots__", ()):
            value = getattr(snap, name, None)
            if isinstance(value, (dict, list)):
                setattr(snap, name, copy.copy(value))
        return snap
    except Exception as e:
        logger.debug("[firetrace] could not copy span data: %r", e)
        return data


# ---------------------------------------------------------------------------
# Payload building
# ---------------------------------------------------------------------------


def _usage_from_sdk(usage: Any) -> dict[str, int]:
    """Map the SDK's usage dict onto FireTrace's ``{inputTokens, …}``."""
    if not isinstance(usage, dict):
        return {}
    out: dict[str, int] = {}
    for src, dst in (
        ("input_tokens", "inputTokens"),
        ("prompt_tokens", "inputTokens"),
        ("inputTokens", "inputTokens"),
        ("output_tokens", "outputTokens"),
        ("completion_tokens", "outputTokens"),
        ("outputTokens", "outputTokens"),
        ("total_tokens", "totalTokens"),
        ("totalTokens", "totalTokens"),
    ):
        v = usage.get(src)
        if isinstance(v, bool) or dst in out:
            continue
        if isinstance(v, (int, float)) and v >= 0:
            out[dst] = int(v)
    if "totalTokens" not in out and ("inputTokens" in out or "outputTokens" in out):
        out["totalTokens"] = out.get("inputTokens", 0) + out.get("outputTokens", 0)
    return out


def _usage_details(usage: Any) -> dict[str, Any]:
    if not isinstance(usage, dict):
        return {}
    attrs: dict[str, Any] = {}
    inp = usage.get("input_tokens_details") or {}
    outp = usage.get("output_tokens_details") or {}
    if isinstance(inp, dict) and inp.get("cached_tokens"):
        attrs["usage.cached_tokens"] = inp["cached_tokens"]
    if isinstance(outp, dict) and outp.get("reasoning_tokens"):
        attrs["usage.reasoning_tokens"] = outp["reasoning_tokens"]
    return attrs


def _response_output(response: Any) -> Any:
    """Compact the OpenAI Responses API output: text, tool calls, reasoning."""
    if response is None:
        return None
    items = getattr(response, "output", None) or []
    text_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    reasoning: list[str] = []
    other: list[str] = []
    refusals: list[str] = []
    for item in items:
        kind = getattr(item, "type", None)
        if kind == "message":
            for part in getattr(item, "content", None) or []:
                t = getattr(part, "text", None)
                if t:
                    text_parts.append(t)
                r = getattr(part, "refusal", None)
                if r:
                    refusals.append(r)
        elif kind == "function_call":
            tool_calls.append(
                {
                    "name": getattr(item, "name", None),
                    "arguments": getattr(item, "arguments", None),
                    "call_id": getattr(item, "call_id", None),
                }
            )
        elif kind == "reasoning":
            for s in getattr(item, "summary", None) or []:
                t = getattr(s, "text", None)
                if t:
                    reasoning.append(t)
        elif kind:
            other.append(str(kind))
    out: dict[str, Any] = {}
    if text_parts:
        out["text"] = "".join(text_parts)
    if refusals:
        out["refusal"] = "".join(refusals)
    if tool_calls:
        out["tool_calls"] = tool_calls
    if reasoning:
        out["reasoning_summary"] = reasoning
    if other:
        out["other_items"] = other
    return out or None


def _parse_json_maybe(value: Any) -> Any:
    if isinstance(value, str):
        s = value.strip()
        if s[:1] in "{[":
            try:
                return json.loads(s)
            except ValueError:
                return value
    return value


def _map_span(snap: _SpanSnapshot, run: _RunRecord) -> dict[str, Any]:
    """One SDK span -> the FireTrace span fields (ids are assigned later)."""
    data = snap.data
    kind = "custom"
    name: Any = snap.type or "span"
    provider: str | None = None
    model: str | None = None
    input_value: Any = None
    output_value: Any = None
    usage: dict[str, int] = {}
    attrs: dict[str, Any] = {}

    if snap.type == "agent":
        kind = "agent"
        name = getattr(data, "name", None) or "agent"
        for key in ("tools", "handoffs", "output_type"):
            v = getattr(data, key, None)
            if v:
                attrs[f"agent.{key}"] = v
    elif snap.type == "response":
        kind = "llm"
        provider = PROVIDER
        response = getattr(data, "response", None)
        model = getattr(response, "model", None) or None
        name = model or "openai.responses"
        input_value = getattr(data, "input", None)
        output_value = _response_output(response)
        usage = _usage_from_sdk(getattr(data, "usage", None))
        attrs.update(_usage_details(getattr(data, "usage", None)))
        rid = getattr(response, "id", None)
        if rid:
            attrs["response.id"] = rid
    elif snap.type == "generation":
        kind = "llm"
        provider = PROVIDER
        model = getattr(data, "model", None) or None
        name = model or "openai.chat.completions"
        input_value = getattr(data, "input", None)
        output_value = getattr(data, "output", None)
        usage = _usage_from_sdk(getattr(data, "usage", None))
        attrs.update(_usage_details(getattr(data, "usage", None)))
        cfg = getattr(data, "model_config", None)
        if cfg:
            attrs["model_config"] = cfg
    elif snap.type == "function":
        kind = "tool"
        name = getattr(data, "name", None) or "tool"
        input_value = _parse_json_maybe(getattr(data, "input", None))
        output_value = getattr(data, "output", None)
        mcp = getattr(data, "mcp_data", None)
        if mcp:
            attrs["mcp"] = mcp
    elif snap.type == "guardrail":
        kind = "custom"
        gname = getattr(data, "name", None) or "guardrail"
        name = f"guardrail:{gname}"
        attrs["guardrail.name"] = gname
        attrs["guardrail.triggered"] = bool(getattr(data, "triggered", False))
    elif snap.type == "handoff":
        kind = "chain"
        src = getattr(data, "from_agent", None) or "?"
        dst = getattr(data, "to_agent", None) or "?"
        name = f"handoff:{src}->{dst}"
    elif snap.type == "turn":
        # One iteration of the agent loop: a model call plus the tool calls it
        # asked for. Its usage is the sum of its own llm children, so it is
        # not added into the trace total (that sums llm spans only).
        kind = "chain"
        turn_no = getattr(data, "turn", None)
        name = f"turn {turn_no}" if turn_no is not None else "turn"
        agent_name = getattr(data, "agent_name", None)
        if agent_name:
            attrs["agent.name"] = agent_name
        usage = _usage_from_sdk(getattr(data, "usage", None))
    elif snap.type == "custom":
        name = getattr(data, "name", None) or "step"
        payload = dict(getattr(data, "data", None) or {})
        k = payload.pop("kind", None)
        kind = k if k in _KINDS else "custom"
        provider = payload.pop("provider", None) or None
        model = payload.pop("model", None) or None
        input_value = payload.pop("input", None)
        output_value = payload.pop("output", None)
        usage = _usage_from_sdk(payload.pop("usage", None))
        attrs.update(payload)
    else:
        try:
            exported = data.export() if hasattr(data, "export") else {}
        except Exception as e:
            logger.debug("[firetrace] span export() failed: %r", e)
            exported = {}
        attrs.update({k: v for k, v in dict(exported or {}).items() if k != "type"})

    attrs.update(snap.extra or {})

    status = "ok"
    if snap.error:
        err = snap.error if isinstance(snap.error, dict) else {"message": str(snap.error)}
        message = str(err.get("message", ""))
        edata = err.get("data") if isinstance(err.get("data"), dict) else {}
        if _GUARDRAIL_TRIPWIRE_MESSAGE in message:
            # A refusal is the guardrail working, not a failure of the run.
            attrs["guardrail.tripwire"] = True
            if edata.get("guardrail"):
                attrs["guardrail.name"] = edata["guardrail"]
        else:
            status = "error"
            attrs["error.type"] = str(edata.get("type") or message or "Error")
            detail = edata.get("error")
            attrs["error.message"] = f"{message}: {detail}" if detail else message
    if snap.ended_at is None:
        status = "unset"
        attrs["firetrace.unfinished"] = True
    elif status == "ok" and kind == "llm" and output_value is None and not usage:
        # The SDK closed the span without a response (a model call cancelled
        # when the guardrail tripped, for instance): outcome unknown, not ok.
        status = "unset"

    span: dict[str, Any] = {
        "name": _clip(name, MAX_NAME_CHARS) or "span",
        "kind": kind,
        "status": status,
        "startedAt": snap.started_at or run.started_at or _now_iso(),
        "endedAt": snap.ended_at or run.ended_at or _now_iso(),
    }
    if _ts_before(span["endedAt"], span["startedAt"]):
        span["endedAt"] = span["startedAt"]
    if provider:
        span["provider"] = _clip(provider, MAX_ID_FIELD_CHARS)
    if model:
        span["model"] = _clip(model, MAX_ID_FIELD_CHARS)
    truncated: list[str] = []
    if input_value is not None:
        span["input"], cut = _bounded(input_value, MAX_SPAN_FIELD_BYTES)
        if cut:
            truncated.append("input")
    if output_value is not None:
        span["output"], cut = _bounded(output_value, MAX_SPAN_FIELD_BYTES)
        if cut:
            truncated.append("output")
    if truncated:
        attrs["firetrace.truncated"] = truncated
    if usage:
        span["usage"] = usage
    if attrs:
        span["attributes"] = _bounded_object(attrs, MAX_SPAN_FIELD_BYTES)
    return span


def _collapse_wrappers(snapshots: list[_SpanSnapshot]) -> list[_SpanSnapshot]:
    """Drop the SDK's ``task`` wrapper spans, re-parenting their children.

    A ``task`` span wraps the whole agent run and spans exactly the agent span
    beneath it, so it adds a level to the tree without adding information.
    """
    wrappers = {s.id: s.parent_id for s in snapshots if s.type == "task"}
    if not wrappers:
        return snapshots

    def resolve(parent_id: str | None) -> str | None:
        hops = 0
        while parent_id in wrappers and hops < 64:
            parent_id = wrappers[parent_id]
            hops += 1
        return parent_id

    kept: list[_SpanSnapshot] = []
    for s in snapshots:
        if s.type == "task":
            continue
        s.parent_id = resolve(s.parent_id)
        kept.append(s)
    return kept


def _bounded(value: Any, max_bytes: int) -> tuple[Any, bool]:
    """Redact ``value`` and bound its size; True when anything was cut."""
    clean, cut = _redact_flagged(value)
    clean, shrunk = _shrink(clean, max_bytes)
    return clean, cut or shrunk


def _bounded_object(value: dict[str, Any], max_bytes: int) -> dict[str, Any]:
    """Redact a metadata/attributes object and keep it under ``max_bytes``.

    These fields must stay JSON objects, so instead of turning the whole thing
    into a string the largest values are replaced, one at a time, with a
    marker until the object fits. Keys are kept.
    """
    clean = redact(value)
    if not isinstance(clean, dict):
        return {"firetrace.dropped": "not an object"}
    total = _byte_len(clean)
    if total <= max_bytes:
        return clean
    sizes = sorted(((k, _byte_len(v)) for k, v in clean.items()), key=lambda kv: -kv[1])
    dropped: list[str] = []
    # Track the size arithmetically rather than re-serializing the object
    # after every drop, which was quadratic on large objects.
    total += len(',"firetrace.dropped":[]')
    for key, size in sizes:
        marker = f"[dropped: {size} bytes]"  # plain ASCII: serializes to len + 2
        clean[key] = marker
        dropped.append(key)
        total += len(marker) + 2 - size + _byte_len(key) + 1
        if total <= max_bytes:
            break
    clean["firetrace.dropped"] = dropped
    return clean


def _new_span_id(taken: set[str]) -> str:
    while True:
        sid = secrets.token_hex(8)
        if sid not in taken:
            taken.add(sid)
            return sid


def build_payload(
    record: _RunRecord, snapshots: list[_SpanSnapshot]
) -> dict[str, Any]:
    """Build the ``IngestRequest`` body for one finished run."""
    _redact_memo.cache = {}
    try:
        return _build_payload(record, snapshots)
    finally:
        _redact_memo.cache = None


def _build_payload(
    record: _RunRecord, snapshots: list[_SpanSnapshot]
) -> dict[str, Any]:
    snapshots = _collapse_wrappers(snapshots)
    ordered = sorted(
        snapshots, key=lambda s: (_parse_ts(s.started_at) or _TS_MAX, s.seq, s.id)
    )
    dropped = record.dropped_spans
    if len(ordered) > MAX_SPANS:
        dropped += len(ordered) - MAX_SPANS
        ordered = ordered[:MAX_SPANS]

    taken: set[str] = set()
    id_map = {snap.id: _new_span_id(taken) for snap in ordered}
    spans: list[dict[str, Any]] = []
    guardrail_blocked = record.guardrail_blocked
    llm_models: list[str] = []
    usage_total: dict[str, int] = {}
    any_error = False
    for snap in ordered:
        mapped = _map_span(snap, record)
        mapped["id"] = id_map[snap.id]
        mapped["parentSpanId"] = id_map.get(snap.parent_id) if snap.parent_id else None
        attrs = mapped.get("attributes") or {}
        if attrs.get("guardrail.triggered") or attrs.get("guardrail.tripwire"):
            guardrail_blocked = True
        if mapped["status"] == "error":
            any_error = True
        if mapped["kind"] == "llm":
            if mapped.get("model"):
                llm_models.append(mapped["model"])
            for k, v in (mapped.get("usage") or {}).items():
                usage_total[k] = usage_total.get(k, 0) + v
        spans.append(mapped)

    status = "error" if (record.error or any_error) else "ok"

    tags = list(record.tags)
    if guardrail_blocked:
        tags.append("guardrail-blocked")
    if record.abandoned:
        tags.append("abandoned")
    if record.cancelled:
        tags.append("cancelled")
    clean_tags: list[str] = []
    for tag in tags:
        t = _clip(str(tag).strip(), MAX_TAG_CHARS)
        if t and t not in clean_tags:
            clean_tags.append(t)
    clean_tags = clean_tags[:MAX_TAGS]

    metadata: dict[str, Any] = dict(record.metadata)
    if guardrail_blocked:
        metadata["guardrail.blocked"] = True
    if record.abandoned:
        metadata["run.abandoned"] = True
        if record.closed_at:
            metadata["run.abandoned_at"] = record.closed_at
    if record.cancelled:
        metadata["run.cancelled"] = True
    if record.error:
        metadata["error.type"], metadata["error.message"] = record.error
    if dropped:
        metadata["firetrace.droppedSpans"] = dropped
    metadata["firetrace.exporter"] = "portfolio-server/openai-agents"

    trace: dict[str, Any] = {
        "id": record.trace_id,
        "name": _clip(record.name or "run", MAX_NAME_CHARS),
        "status": status,
        "startedAt": record.started_at or _now_iso(),
        "endedAt": record.ended_at or _now_iso(),
        "tags": clean_tags,
        "metadata": _bounded_object(metadata, MAX_TRACE_FIELD_BYTES),
        "spans": spans,
    }
    if _ts_before(trace["endedAt"], trace["startedAt"]):
        trace["endedAt"] = trace["startedAt"]
    provider = record.provider or (PROVIDER if llm_models else None)
    # Scalars go through _clip too: a lone surrogate from a client body (a
    # browser-chosen user id, say) would otherwise fail the whole encode.
    if provider:
        trace["provider"] = _clip(provider, MAX_ID_FIELD_CHARS)
    model = record.model or (llm_models[0] if llm_models else None)
    if model:
        trace["model"] = _clip(model, MAX_ID_FIELD_CHARS)
    if record.session_id:
        trace["sessionId"] = _clip(record.session_id, MAX_ID_FIELD_CHARS)
    if record.user_id:
        trace["userId"] = _clip(record.user_id, MAX_ID_FIELD_CHARS)
    truncated: list[str] = []
    if record.input is not None:
        trace["input"], cut = _bounded(record.input, MAX_TRACE_FIELD_BYTES)
        if cut:
            truncated.append("input")
    if record.output is not None:
        trace["output"], cut = _bounded(record.output, MAX_TRACE_FIELD_BYTES)
        if cut:
            truncated.append("output")
    if usage_total:
        trace["usage"] = usage_total

    payload = {"schemaVersion": 1, "trace": trace}
    _fit_request(payload, truncated)
    if truncated:
        trace["metadata"]["firetrace.truncated"] = truncated
    return payload


def _fit_request(payload: dict[str, Any], truncated: list[str]) -> None:
    """Keep the request under FireTrace's 2 MiB limit, and each stored
    document (the trace without its spans, each span) under its 750 KiB one."""
    trace = payload["trace"]
    total = _byte_len(payload)
    if total > _MAX_DOCUMENT_BYTES:
        # A single document can only be too big when the whole request is.
        doc = {k: v for k, v in trace.items() if k != "spans"}
        if _byte_len(doc) > _MAX_DOCUMENT_BYTES:
            trace.pop("input", None)
            trace.pop("output", None)
            trace["metadata"] = _bounded_object(trace.get("metadata") or {}, 4096)
            truncated.append("trace.document")
        for span in trace["spans"]:
            if _byte_len(span) > _MAX_DOCUMENT_BYTES:
                for key in ("input", "output", "attributes"):
                    span.pop(key, None)
                if "span.document" not in truncated:
                    truncated.append("span.document")
        total = _byte_len(payload)
    if total <= _TARGET_REQUEST_BYTES:
        return
    for span in trace["spans"]:
        span.pop("input", None)
        span.pop("output", None)
    truncated.append("spans.content")
    if _byte_len(payload) <= _TARGET_REQUEST_BYTES:
        return
    trace.pop("input", None)
    trace.pop("output", None)
    truncated.append("trace.content")
    if _byte_len(payload) <= _TARGET_REQUEST_BYTES:
        return
    for span in trace["spans"]:
        span.pop("attributes", None)
    truncated.append("spans.attributes")
    if _byte_len(payload) <= _TARGET_REQUEST_BYTES:
        return
    trace["metadata"] = _bounded_object(trace.get("metadata") or {}, 4096)
    truncated.append("metadata")
    if _byte_len(payload) <= _TARGET_REQUEST_BYTES:
        return
    trace["spans"] = trace["spans"][:1]
    truncated.append("spans")


# ---------------------------------------------------------------------------
# Sending (background thread only)
# ---------------------------------------------------------------------------


def _deliver(
    body: bytes, api_key: str, timeout: float = _SEND_TIMEOUT_SECONDS
) -> tuple[int, dict[str, Any] | None]:
    """One POST. Returns ``(status, json)``; raises on network failure."""
    request = urllib.request.Request(
        INGEST_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "portfolio-server-firetrace/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            status = int(resp.status)
            raw = resp.read()
    except urllib.error.HTTPError as e:
        status = int(e.code)
        try:
            raw = e.read()
        except Exception as read_error:
            logger.debug("[firetrace] could not read error body: %r", read_error)
            raw = b""
    try:
        parsed = json.loads(raw.decode("utf-8")) if raw else None
    except (ValueError, UnicodeDecodeError):
        parsed = None
    return status, parsed if isinstance(parsed, dict) else None


def _dashboard_base() -> str:
    return INGEST_URL.split("/api/", 1)[0]


def _error_bits(data: dict[str, Any] | None) -> tuple[str, str, str]:
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        return (
            str(err.get("code", "?")),
            str(err.get("message", ""))[:300],
            str(err.get("requestId", "?")),
        )
    return "?", "", str((data or {}).get("requestId", "?"))


def send_with_retry(
    body: bytes,
    api_key: str,
    trace_id: str,
    span_count: int,
    hurry: Callable[[], bool] | None = None,
) -> bool:
    """POST one trace. Retries network errors, 429 and 5xx; never raises.

    While ``hurry()`` is true (the process is exiting, or a backlog has built
    up) there is a single attempt with a short timeout and no backoff, so the
    queue drains instead of spending a minute on each trace.
    """
    attempts = len(_RETRY_DELAYS_SECONDS) + 1
    for attempt in range(1, attempts + 1):
        stopping = hurry is not None and hurry()
        timeout = _SHUTDOWN_SEND_TIMEOUT_SECONDS if stopping else _SEND_TIMEOUT_SECONDS
        reason: str
        try:
            status, data = _deliver(body, api_key, timeout=timeout)
        # HTTPException covers a connection cut mid-response (IncompleteRead,
        # BadStatusLine), which is not an OSError but is a network failure.
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as e:
            reason = f"network error: {getattr(e, 'reason', None) or e!r}"
        except Exception as e:
            # Not a network problem, so a retry cannot help; say so and stop.
            logger.warning(
                "[firetrace] trace %s not recorded: unexpected error %s: %s",
                trace_id,
                type(e).__name__,
                str(e)[:300],
            )
            return False
        else:
            if status == 201:
                project = (data or {}).get("projectId", "?")
                logger.info(
                    "[firetrace] recorded trace %s (%d spans) %s/projects/%s/traces/%s",
                    trace_id,
                    span_count,
                    _dashboard_base(),
                    project,
                    trace_id,
                )
                return True
            if status == 200:
                logger.warning(
                    "[firetrace] trace %s was already recorded (duplicate=%s)",
                    trace_id,
                    (data or {}).get("duplicate"),
                )
                return True
            code, message, request_id = _error_bits(data)
            if status == 429 or status >= 500:
                reason = f"HTTP {status} {code} {message} (requestId {request_id})"
            else:
                logger.warning(
                    "[firetrace] trace %s rejected, not retrying: HTTP %s %s %s (requestId %s)",
                    trace_id,
                    status,
                    code,
                    message,
                    request_id,
                )
                return False
        if stopping or attempt >= attempts:
            logger.warning(
                "[firetrace] trace %s not recorded after %d attempt(s) (%s)",
                trace_id,
                attempt,
                reason,
            )
            return False
        delay = _RETRY_DELAYS_SECONDS[attempt - 1] * (1 + random.random() * 0.25)
        logger.warning(
            "[firetrace] trace %s attempt %d/%d failed (%s); retrying in %.1fs",
            trace_id,
            attempt,
            attempts,
            reason,
            delay,
        )
        time.sleep(delay)
    return False


# ---------------------------------------------------------------------------
# Public API for call sites
# ---------------------------------------------------------------------------

_PROCESSOR = FireTraceProcessor()
_installed = False
_install_lock = threading.Lock()


def install() -> FireTraceProcessor:
    """Register the processor with the Agents SDK (idempotent)."""
    global _installed
    with _install_lock:
        if not _installed:
            _configure_logging()
            add_trace_processor(_PROCESSOR)
            # The SDK's own atexit hook skips processors when its tracing is
            # disabled; register directly so the export queue is drained
            # either way.
            atexit.register(_PROCESSOR.shutdown)
            _installed = True
    return _PROCESSOR


def _configure_logging() -> None:
    """Make this module's lines visible under uvicorn's default logging.

    Uvicorn configures only its own loggers and leaves the root unconfigured,
    so INFO lines from other loggers vanish. When nobody has set up the root
    logger, give ours a plain stdout handler; when someone has, respect it.
    """
    if logging.getLogger().handlers or logger.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


class traced_run:
    """Open one traced run.

    Wraps the SDK's ``trace()`` so the run's spans are collected, and returns a
    :class:`RunHandle` for the request, the result and the outcome::

        with traced_run("portfolio_text_response", session_id=call_id,
                        input={"messages": messages}, model=AGENT_MODEL) as run:
            ...
            run.set_output({"text": full_text})

    Leaving the block sends the trace (after the run, off the event loop).
    ``GeneratorExit`` (a streamed response the caller stopped consuming) and
    ``CancelledError`` are tagged rather than counted as errors; any other
    exception marks the trace ``error`` unless the call site already recorded a
    guardrail refusal.
    """

    def __init__(
        self,
        name: str,
        *,
        session_id: str | None = None,
        user_id: str | None = None,
        input: Any = None,
        metadata: dict[str, Any] | None = None,
        model: str | None = None,
        provider: str | None = PROVIDER,
        tags: tuple[str, ...] | list[str] = (),
    ) -> None:
        self._name = name
        self._session_id = session_id
        self._user_id = user_id
        self._input = input
        self._metadata = dict(metadata or {})
        self._model = model
        self._provider = provider
        self._tags = list(tags)
        self._record: _RunRecord | None = None
        self._sdk_trace: Trace | None = None
        self._sdk_trace_id: str | None = None

    def __enter__(self) -> RunHandle:
        try:
            install()
            trace_id = _new_trace_id()
            self._sdk_trace_id = f"trace_{trace_id}"
            if enabled():
                self._record = _RunRecord(
                    sdk_trace_id=self._sdk_trace_id,
                    trace_id=trace_id,
                    name=self._name,
                    session_id=self._session_id,
                    user_id=self._user_id,
                    model=self._model,
                    provider=self._provider,
                    input=self._input,
                    tags=list(self._tags),
                    metadata=dict(self._metadata),
                    started_at=_now_iso(),
                )
                _PROCESSOR.register(self._record)
            # The SDK's own OpenAI exporter uploads this trace's metadata with
            # none of FireTrace's redaction, so it gets short scalars only.
            # Anything richer or client-supplied belongs in run.set_metadata().
            sdk_metadata = {
                k: str(v)
                for k, v in self._metadata.items()
                if isinstance(v, (str, int, float, bool)) and len(str(v)) <= 200
            }
            self._sdk_trace = sdk_trace(
                workflow_name=self._name,
                trace_id=self._sdk_trace_id,
                group_id=self._session_id,
                metadata=sdk_metadata or None,
            )
            self._sdk_trace.__enter__()
        except Exception as e:
            logger.warning("[firetrace] could not open run %r: %r", self._name, e)
            self._sdk_trace = None
        return RunHandle(self._record)

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        try:
            record = self._record
            if record is not None and exc_type is not None:
                if exc_type is GeneratorExit:
                    record.abandoned = True
                elif issubclass(exc_type, asyncio.CancelledError):
                    record.cancelled = True
                elif "GuardrailTripwireTriggered" in getattr(exc_type, "__name__", ""):
                    record.guardrail_blocked = True
                elif not record.guardrail_blocked:
                    record.error = (getattr(exc_type, "__name__", "Error"), str(exc_val))
            if self._sdk_trace is not None:
                self._sdk_trace.__exit__(exc_type, exc_val, exc_tb)
        except Exception as e:
            logger.warning("[firetrace] could not close run %r: %r", self._name, e)
        finally:
            # Always, even if the SDK's exit raised: if the SDK never reported
            # the end (tracing disabled, or its exit failed), export what we
            # have so the run is recorded and its record does not leak.
            if self._sdk_trace_id is not None:
                try:
                    _PROCESSOR.finish_if_pending(self._sdk_trace_id)
                except Exception as e:
                    logger.warning("[firetrace] could not finish run %r: %r", self._name, e)
        return False


@contextmanager
def step(name: str, kind: str = "custom", **fields: Any) -> Iterator[dict[str, Any]]:
    """Record one child step under the current span.

    ``kind`` is a FireTrace span kind (``embedding``, ``retriever`` …). The
    yielded dict is the span's data: set ``output`` and ``usage`` on it before
    the block ends. Extra keys become span attributes. Without an active run
    (the debug CLI's direct search, tests) this is a no-op.
    """
    data: dict[str, Any] = {"kind": kind if kind in _KINDS else "custom", **fields}
    span: Span[Any] | None = None
    try:
        if get_current_trace() is not None:
            span = custom_span(name, data=data)
            span.start(mark_as_current=True)
    except Exception as e:
        logger.warning("[firetrace] could not open step %r: %r", name, e)
        span = None
    try:
        yield data
    except BaseException as e:
        # Only failures mark the step as an error. Cancellation (a hang-up, a
        # client disconnect) is not the step failing; traced_run tags the run
        # "cancelled" instead, as the SDK's own spans leave it unmarked.
        if span is not None and isinstance(e, Exception):
            try:
                span.set_error(
                    SpanError(
                        message=f"{type(e).__name__}: {e}"[:500],
                        data={"type": type(e).__name__},
                    )
                )
            except Exception as mark_error:
                logger.debug("[firetrace] could not mark step error: %r", mark_error)
        raise
    finally:
        if span is not None:
            try:
                span.finish(reset_current=True)
            except Exception as e:
                logger.warning("[firetrace] could not close step %r: %r", name, e)


def annotate(**attrs: Any) -> None:
    """Attach attributes to the SDK span currently executing, if any."""
    try:
        span = get_current_span()
        if span is not None and attrs:
            _PROCESSOR.annotate_span(span, attrs)
    except Exception as e:
        logger.warning("[firetrace] annotate failed: %r", e)
