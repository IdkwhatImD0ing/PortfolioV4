"""Send a voice call's page moves and live captions to the visitor's browser.

Retell's v3 web calls, the only kind left after 2026-09-30, no longer pass the
`metadata` event or live transcript updates through to the browser. Page
navigation ran on the first and the call panel's captions on the second. So the
server sends both itself, over Pusher Channels:

1. The browser makes up a random UUID, subscribes to the public channel
   `voice-<uuid>`, and puts the UUID in the call's metadata as `events_channel`
   when it creates the call.
2. Retell hands that metadata to this server in the `call_details` event.
3. For the rest of the call, main.py publishes each navigation event and the
   last few transcript lines to that channel.

A public channel is enough. Its name is a random UUID other visitors can't
guess, and no Pusher auth endpoint means one less thing to deploy. The id does
reach this call's trace metadata and Retell's call record, which only the
owner can read. PUSHER_SECRET is what really keeps calls private: with it,
anyone could list the open `voice-` channels and read or forge their events.
Unlike the app key, it must stay secret.

Publishing never holds up the voice reply. Events go out on background tasks,
one at a time so they arrive in order, and a failed send is logged and dropped:
a page that stops following along is better than an agent that goes quiet.
"""

import asyncio
import functools
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor

import certifi
import pusher
from pusher.requests import RequestsBackend

__all__ = ["VoiceEvents", "caption_window", "channel_for"]

# Not secrets: the browser needs the key and cluster to subscribe, and the app
# id means nothing without the secret. Overridable per environment.
DEFAULT_APP_ID = "2196222"
DEFAULT_KEY = "3b1aa13ad53a1a55ff03"
DEFAULT_CLUSTER = "us3"

CHANNEL_PREFIX = "voice-"
# What crypto.randomUUID() produces. The id arrives in call metadata the browser
# chose, so anything else is refused rather than passed to Pusher.
_CHANNEL_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

# Retell's update events carry the whole transcript; only the last few lines
# still change. Each line goes out with its index in Retell's transcript, and
# the browser replaces lines by index (client/src/lib/transcript.ts
# mergeVoiceLines). Guessing how a window lines up with what's on screen broke
# as soon as two lines changed between sends, which the throttle makes common.
TRANSCRIPT_WINDOW = 5
# Pusher rejects an event whose data is over 10 KB. Stay well under it.
MAX_EVENT_CHARS = 9000
MAX_LINE_CHARS = 4000
# Retell sends an update for nearly every word. Captions go out at most this
# often; the newest window always wins, so none of the text is lost.
CAPTION_INTERVAL_S = 0.25
# How long the end of a call waits for events still being sent.
CLOSE_TIMEOUT_S = 2.0
PUSHER_TIMEOUT_S = 3

# The pusher library blocks, so sends run on threads. Its own small pool: on
# the default one, a stalled Pusher could hold every worker and queue the DNS
# lookups the OpenAI and Pinecone clients make there.
_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="pusher")

_client: pusher.Pusher | None = None
_warned_unconfigured = False
_build_failed = False


class _CertifiBackend(RequestsBackend):
    """The library's requests backend, checking TLS against certifi.

    Left alone, it checks against a root list bundled with the library in
    2021, which neither a certifi update nor the Docker image can refresh.
    """

    def __init__(self, client, **options):
        super().__init__(client, **options)
        if client.ssl:
            self.options["verify"] = certifi.where()


def _pusher_client() -> pusher.Pusher | None:
    """The process-wide Pusher client, or None when PUSHER_SECRET is unset.

    Built on first use, not at import: main.py loads .env after importing its
    modules. One client for the whole process, so every call reuses its
    connection pool and a navigation event doesn't pay for a TLS handshake.
    """
    global _client, _warned_unconfigured, _build_failed
    if _client is not None:
        return _client
    if _build_failed:
        return None
    secret = os.getenv("PUSHER_SECRET")
    if not secret:
        if not _warned_unconfigured:
            _warned_unconfigured = True
            print(
                "[voice-events] PUSHER_SECRET is not set; voice calls won't move "
                "the page or show captions",
                flush=True,
            )
        return None
    try:
        _client = pusher.Pusher(
            app_id=os.getenv("PUSHER_APP_ID") or DEFAULT_APP_ID,
            key=os.getenv("PUSHER_KEY") or DEFAULT_KEY,
            secret=secret,
            cluster=os.getenv("PUSHER_CLUSTER") or DEFAULT_CLUSTER,
            ssl=True,
            timeout=PUSHER_TIMEOUT_S,
            backend=_CertifiBackend,
        )
    except Exception as e:  # noqa: BLE001 - a bad override must not stop the call
        # Runs inside the call_details handler, before the greeting is sent.
        # A config error won't fix itself, so don't retry and log it per call.
        _build_failed = True
        print(f"[voice-events] Pusher client not built: {type(e).__name__}: {e}", flush=True)
        return None
    return _client


def channel_for(call: object) -> str | None:
    """The Pusher channel a call's browser listens on, or None if it named none."""
    metadata = call.get("metadata") if isinstance(call, dict) else None
    raw = metadata.get("events_channel") if isinstance(metadata, dict) else None
    if not isinstance(raw, str) or not _CHANNEL_ID.fullmatch(raw):
        return None
    return CHANNEL_PREFIX + raw


def _chars(data: object) -> int:
    # The size of what _send hands to pusher: ASCII-only JSON, so characters
    # are bytes, which is what Pusher's 10 KB limit counts. (The library's own
    # check, sys.getsizeof under 30720, then passes with room to spare.)
    return len(json.dumps(data))


def caption_window(transcript: object) -> list[dict]:
    """The last few spoken lines, as {index, role, content}, small enough for
    one event.

    `index` is the line's position in Retell's transcript, which stays put as
    the line grows or is corrected, so the browser can replace it in place.
    Drops Retell's per-word timings and anything that isn't a visitor or agent
    line with text in it (their indices are simply skipped).
    """
    if not isinstance(transcript, list):
        return []
    lines = [
        {"index": i, "role": u["role"], "content": u["content"][:MAX_LINE_CHARS]}
        for i, u in enumerate(transcript)
        if isinstance(u, dict)
        and u.get("role") in ("agent", "user")
        and isinstance(u.get("content"), str)
        and u["content"].strip()
    ]
    window = lines[-TRANSCRIPT_WINDOW:]
    while len(window) > 1 and _chars({"transcript": window}) > MAX_EVENT_CHARS:
        window = window[1:]
    # One line can still be too big: ASCII-only JSON spells each non-ASCII
    # character as a six-character escape (twelve for an emoji). Cut it from
    # the end, so the start the browser already shows stays put.
    while window and _chars({"transcript": window}) > MAX_EVENT_CHARS:
        line = window[0]
        content = line["content"][: len(line["content"]) // 2]
        window = [{**line, "content": content}] if content.strip() else []
    return window


class VoiceEvents:
    """One voice call's outbox to its browser."""

    def __init__(self, channel: str, client: pusher.Pusher):
        self.channel = channel
        self._client = client
        # One send at a time. asyncio.Lock wakes waiters in the order they
        # queued, so events reach the browser in the order they were made.
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task] = set()
        self._pending_caption: list[dict] | None = None
        self._last_caption: list[dict] | None = None
        self._caption_task: asyncio.Task | None = None
        self._closed = False

    @classmethod
    def for_call(cls, call: object) -> "VoiceEvents | None":
        """An outbox for this call, or None if it has nowhere to send to."""
        channel = channel_for(call)
        if channel is None:
            return None
        client = _pusher_client()
        if client is None:
            return None
        return cls(channel, client)

    def navigation(self, meta: dict) -> None:
        """Move the visitor's page. Returns at once; the send happens later."""
        if self._closed:
            return
        self._spawn(self._send("navigation", meta))

    def transcript(self, transcript: object) -> None:
        """Show the call's latest lines. Updates that change nothing are skipped."""
        if self._closed:
            return
        window = caption_window(transcript)
        # Retell also sends an update when the speaker changes, with the same
        # text as the last one.
        if not window or window == (self._pending_caption or self._last_caption):
            return
        self._pending_caption = window
        if self._caption_task is None or self._caption_task.done():
            self._caption_task = self._spawn(self._drain_captions())

    async def aclose(self) -> None:
        """Stop taking events, and give the ones in flight a moment to go out."""
        self._closed = True
        pending = [t for t in self._tasks if not t.done()]
        if not pending:
            return
        _, late = await asyncio.wait(pending, timeout=CLOSE_TIMEOUT_S)
        for task in late:
            task.cancel()
        await asyncio.gather(*late, return_exceptions=True)

    async def _drain_captions(self) -> None:
        while self._pending_caption is not None:
            window, self._pending_caption = self._pending_caption, None
            # Only a delivered window counts as sent: after a failure, the next
            # update with the same text must go out, not be skipped as a repeat.
            if await self._send("transcript", {"transcript": window}):
                self._last_caption = window
            await asyncio.sleep(CAPTION_INTERVAL_S)

    def _spawn(self, coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def _send(self, event: str, data: dict) -> bool:
        """Publish one event; True if Pusher accepted it."""
        # Serialised here, ASCII-only. Given a dict, the library keeps
        # non-ASCII text raw and sizes it with sys.getsizeof, which counts an
        # emoji-bearing string at four bytes a character and rejects captions
        # that fit Pusher's limit. A string passes through unchanged, and the
        # browser decodes the same object either way.
        payload = json.dumps(data)
        async with self._lock:
            try:
                await asyncio.get_running_loop().run_in_executor(
                    _POOL, functools.partial(self._client.trigger, self.channel, event, payload)
                )
            except Exception as e:  # noqa: BLE001 - a lost event must not end the call
                print(f"[voice-events] {event} not sent: {type(e).__name__}: {e}", flush=True)
                return False
            return True
