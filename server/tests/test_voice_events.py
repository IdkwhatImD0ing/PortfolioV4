"""Tests for voice_events.py: the Pusher outbox for a voice call's page moves
and captions. No test here talks to Pusher; conftest.py drops PUSHER_SECRET,
and every outbox is built around a fake client."""

import asyncio
import json
import threading
import time
from pathlib import Path

import certifi
import pusher
import pytest

import voice_events
from voice_events import (
    MAX_EVENT_CHARS,
    MAX_LINE_CHARS,
    TRANSCRIPT_WINDOW,
    VoiceEvents,
    caption_window,
    channel_for,
)

CHANNEL_ID = "123e4567-e89b-42d3-a456-426614174000"
CHANNEL = f"voice-{CHANNEL_ID}"


def call_with(metadata):
    return {"call_id": "call_abc", "metadata": metadata}


class FakePusher:
    """Records triggers, decoded. `delay` (a number, or a function of the data)
    makes a send slow; `fail` makes it raise. Tracks how many sends overlap."""

    def __init__(self, delay=0.0, fail=None):
        self.sent = []
        self.raw = []
        self.delay = delay
        self.fail = fail
        self.lock = threading.Lock()
        self.running = 0
        self.max_running = 0

    def trigger(self, channel, event, data):
        with self.lock:
            self.running += 1
            self.max_running = max(self.max_running, self.running)
        try:
            self.raw.append(data)
            decoded = json.loads(data) if isinstance(data, str) else data
            delay = self.delay(decoded) if callable(self.delay) else self.delay
            if delay:
                time.sleep(delay)
            if self.fail and self.fail(event, decoded):
                raise RuntimeError("pusher is down")
            with self.lock:
                self.sent.append((channel, event, decoded))
        finally:
            with self.lock:
                self.running -= 1


# --- channel_for -------------------------------------------------------------


class TestChannelFor:
    def test_uuid_from_metadata_names_the_channel(self):
        assert channel_for(call_with({"events_channel": CHANNEL_ID})) == CHANNEL

    @pytest.mark.parametrize(
        "call",
        [
            None,
            "not a dict",
            {},
            {"metadata": None},
            {"metadata": "events_channel"},
            call_with({}),
            call_with({"events_channel": None}),
            call_with({"events_channel": 42}),
        ],
    )
    def test_no_channel_when_the_call_names_none(self, call):
        assert channel_for(call) is None

    @pytest.mark.parametrize(
        "raw",
        [
            CHANNEL_ID.upper(),  # crypto.randomUUID() is lowercase
            CHANNEL_ID + "x",
            " " + CHANNEL_ID,
            CHANNEL_ID.replace("-", ""),
            "private-" + CHANNEL_ID,
            CHANNEL_ID[:-1] + "#",
            "voice-" + CHANNEL_ID,
            "../" + CHANNEL_ID,
        ],
    )
    def test_anything_but_a_bare_uuid_is_refused(self, raw):
        # The id comes from metadata the browser chose; only one shape passes.
        assert channel_for(call_with({"events_channel": raw})) is None


# --- caption_window ----------------------------------------------------------


def utt(role, content):
    return {"role": role, "content": content, "words": [{"word": "x", "start": 0, "end": 1}]}


class TestCaptionWindow:
    def test_keeps_index_role_and_content_only(self):
        assert caption_window([utt("agent", "Hi."), utt("user", "Hello")]) == [
            {"index": 0, "role": "agent", "content": "Hi."},
            {"index": 1, "role": "user", "content": "Hello"},
        ]

    def test_a_line_keeps_its_index_as_it_grows(self):
        # What lets the browser replace a line instead of adding a new one.
        first = caption_window([utt("agent", "Hi!"), utt("user", "Let me")])
        later = caption_window([utt("agent", "Hi!"), utt("user", "Let me solve"), utt("agent", "I've")])
        assert first[-1] == {"index": 1, "role": "user", "content": "Let me"}
        assert later[1] == {"index": 1, "role": "user", "content": "Let me solve"}
        assert later[2]["index"] == 2

    def test_drops_other_roles_empty_lines_and_junk(self):
        transcript = [
            utt("agent", "Hi."),
            utt("transfer_target", "Hold on"),
            utt("user", "   "),
            {"role": "user"},
            {"role": "user", "content": 5},
            "text",
            utt("user", "Tell me about GitPT"),
        ]
        # Skipped lines leave gaps; the kept ones keep Retell's own positions.
        assert caption_window(transcript) == [
            {"index": 0, "role": "agent", "content": "Hi."},
            {"index": 6, "role": "user", "content": "Tell me about GitPT"},
        ]

    @pytest.mark.parametrize("transcript", [None, "text", {"role": "user"}, 5, []])
    def test_not_a_list_gives_nothing(self, transcript):
        assert caption_window(transcript) == []

    def test_keeps_only_the_last_few_lines(self):
        transcript = [utt("user" if i % 2 else "agent", f"line {i}") for i in range(12)]
        window = caption_window(transcript)
        assert len(window) == TRANSCRIPT_WINDOW
        assert window[-1]["content"] == "line 11"

    def test_drops_older_lines_until_it_fits_one_event(self):
        transcript = [utt("agent", str(i) * 3000) for i in range(5)]
        window = caption_window(transcript)
        assert len(json.dumps({"transcript": window})) <= MAX_EVENT_CHARS
        assert window[-1]["content"] == "4" * 3000

    def test_caps_one_long_line_keeping_its_start(self):
        window = caption_window([utt("user", "a" * 5000 + "b" * 5000)])
        assert window == [{"index": 0, "role": "user", "content": "a" * MAX_LINE_CHARS}]

    def test_non_ascii_line_is_cut_to_fit(self):
        # _send's ASCII-only JSON writes each "é" as a six-character escape.
        window = caption_window([utt("agent", "é" * 4000)])
        assert window and window[0]["content"] == "é" * len(window[0]["content"])
        assert len(json.dumps({"transcript": window})) <= MAX_EVENT_CHARS

    def test_every_event_fits_whatever_the_input(self):
        transcript = [utt("agent", "💬" * 4000), utt("user", "é" * 4000)] * 3
        assert len(json.dumps({"transcript": caption_window(transcript)})) <= MAX_EVENT_CHARS

    def test_the_pusher_library_accepts_what_we_send(self):
        # A full window with one emoji. The library sizes its payload with
        # sys.getsizeof, which counts a string holding an emoji at four bytes
        # a character: given the dict it refuses this window, given the
        # ASCII JSON that _send passes it builds the request. No network:
        # make_request only builds it.
        transcript = [utt("agent", "a" * 1700 + "🙂")] + [utt("user", "b" * 1700)] * 4
        window = caption_window(transcript)
        assert len(window) == 5
        client = pusher.Pusher(app_id="1", key="k", secret="s", cluster="us3")
        trigger = client._pusher_client.trigger
        with pytest.raises(ValueError, match="Too much data"):
            trigger.make_request(CHANNEL, "transcript", {"transcript": window})
        trigger.make_request(CHANNEL, "transcript", json.dumps({"transcript": window}))


# --- VoiceEvents -------------------------------------------------------------


@pytest.fixture
def fast_captions(monkeypatch):
    monkeypatch.setattr(voice_events, "CAPTION_INTERVAL_S", 0.05)


class TestNavigation:
    async def test_publishes_on_the_calls_channel(self):
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        events.navigation({"type": "navigation", "page": "resume"})
        await events.aclose()
        assert fake.sent == [(CHANNEL, "navigation", {"type": "navigation", "page": "resume"})]

    async def test_returns_before_the_send_finishes(self):
        fake = FakePusher(delay=0.3)
        events = VoiceEvents(CHANNEL, fake)
        started = time.monotonic()
        events.navigation({"type": "navigation", "page": "resume"})
        assert time.monotonic() - started < 0.05
        await events.aclose()
        assert len(fake.sent) == 1

    async def test_events_arrive_in_the_order_they_were_made(self):
        # The first send is the slowest, so anything that let sends overlap
        # would deliver the later ones first.
        fake = FakePusher(delay=lambda data: 0.1 if data.get("page") == "resume" else 0)
        events = VoiceEvents(CHANNEL, fake)
        pages = ["resume", "education", "hackathons", "homepage", "architecture"]
        for page in pages:
            events.navigation({"type": "navigation", "page": page})
        await events.aclose()
        assert [data["page"] for _, _, data in fake.sent] == pages
        assert fake.max_running == 1

    async def test_sends_ascii_only_json(self):
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        events.navigation({"type": "navigation", "page": "project", "project_id": "café-🙂"})
        await events.aclose()
        (raw,) = fake.raw
        assert isinstance(raw, str) and raw.isascii()
        assert json.loads(raw)["project_id"] == "café-🙂"

    async def test_a_failed_send_is_logged_and_the_next_still_goes(self, capsys):
        fake = FakePusher(fail=lambda event, data: data.get("page") == "resume")
        events = VoiceEvents(CHANNEL, fake)
        events.navigation({"type": "navigation", "page": "resume"})
        events.navigation({"type": "navigation", "page": "education"})
        await events.aclose()
        assert [data["page"] for _, _, data in fake.sent] == ["education"]
        out = capsys.readouterr().out
        assert "navigation not sent: RuntimeError" in out
        assert CHANNEL_ID not in out


class TestCaptions:
    async def test_sends_the_latest_window(self, fast_captions):
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        events.transcript([utt("agent", "Hi, I'm Bill.")])
        await events.aclose()
        assert fake.sent == [
            (
                CHANNEL,
                "transcript",
                {"transcript": [{"index": 0, "role": "agent", "content": "Hi, I'm Bill."}]},
            )
        ]

    async def test_a_burst_of_updates_is_coalesced_to_the_newest(self, fast_captions):
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        words = "one two three four five six seven eight nine ten".split()
        events.transcript([utt("agent", "one")])
        await asyncio.sleep(0.02)  # the first update goes out at once
        for i in range(2, len(words) + 1):
            events.transcript([utt("agent", " ".join(words[:i]))])
        await events.aclose()
        sent = [data["transcript"][0]["content"] for _, event, data in fake.sent]
        # The rest arrive while it waits out the interval and collapse into the last.
        assert sent == ["one", " ".join(words)]

    async def test_an_update_that_changes_nothing_is_not_sent(self, fast_captions):
        # Retell also sends an update when only the speaker changed.
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        transcript = [utt("agent", "Hi."), utt("user", "Hello")]
        events.transcript(transcript)
        await asyncio.sleep(0.1)
        events.transcript(transcript)
        await events.aclose()
        assert len(fake.sent) == 1

    async def test_a_caption_that_failed_to_send_goes_out_on_the_next_update(self, fast_captions):
        failing = [True]
        fake = FakePusher(fail=lambda event, data: failing[0])
        events = VoiceEvents(CHANNEL, fake)
        transcript = [utt("agent", "I'm Bill Zhang.")]
        events.transcript(transcript)
        await asyncio.sleep(0.1)
        failing[0] = False
        events.transcript(transcript)
        await events.aclose()
        assert [data["transcript"][0]["content"] for _, _, data in fake.sent] == ["I'm Bill Zhang."]

    async def test_an_empty_transcript_sends_nothing(self, fast_captions):
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        events.transcript([])
        events.transcript([utt("agent", "  ")])
        await events.aclose()
        assert fake.sent == []

    async def test_navigation_isnt_held_behind_the_caption_throttle(self, monkeypatch):
        monkeypatch.setattr(voice_events, "CAPTION_INTERVAL_S", 5)
        monkeypatch.setattr(voice_events, "CLOSE_TIMEOUT_S", 0.1)
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        events.transcript([utt("agent", "Let me pull that up.")])
        await asyncio.sleep(0.05)  # sent; captions now wait out the interval
        events.transcript([utt("agent", "Let me pull that up. Here")])
        events.navigation({"type": "navigation", "page": "resume"})
        await asyncio.sleep(0.2)
        assert [event for _, event, _ in fake.sent] == ["transcript", "navigation"]
        # The newer caption is held for the interval, not lost.
        assert events._pending_caption == [
            {"index": 0, "role": "agent", "content": "Let me pull that up. Here"}
        ]
        await events.aclose()


class TestClose:
    async def test_waits_for_events_in_flight(self):
        fake = FakePusher(delay=0.1)
        events = VoiceEvents(CHANNEL, fake)
        events.navigation({"type": "navigation", "page": "resume"})
        await events.aclose()
        assert len(fake.sent) == 1

    async def test_gives_up_on_a_hung_send(self, monkeypatch):
        monkeypatch.setattr(voice_events, "CLOSE_TIMEOUT_S", 0.1)
        fake = FakePusher(delay=1.0)
        events = VoiceEvents(CHANNEL, fake)
        events.navigation({"type": "navigation", "page": "resume"})
        started = time.monotonic()
        await events.aclose()
        assert time.monotonic() - started < 0.5

    async def test_ignores_events_after_close(self, fast_captions):
        fake = FakePusher()
        events = VoiceEvents(CHANNEL, fake)
        await events.aclose()
        events.navigation({"type": "navigation", "page": "resume"})
        events.transcript([utt("agent", "Hi.")])
        await asyncio.sleep(0.05)
        assert fake.sent == []

    async def test_close_with_nothing_pending_returns_at_once(self):
        events = VoiceEvents(CHANNEL, FakePusher())
        await events.aclose()


# --- for_call ----------------------------------------------------------------


@pytest.fixture
def pusher_built(monkeypatch):
    """Record the arguments the real Pusher client would be built with."""
    built = []

    class RecordingPusher:
        def __init__(self, **kwargs):
            built.append(kwargs)

    monkeypatch.setattr(voice_events.pusher, "Pusher", RecordingPusher)
    return built


class TestForCall:
    def test_none_without_a_pusher_secret(self, monkeypatch, capsys, pusher_built):
        monkeypatch.setattr(voice_events, "_warned_unconfigured", False)
        assert VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID})) is None
        assert "PUSHER_SECRET is not set" in capsys.readouterr().out
        assert pusher_built == []

    def test_warns_about_a_missing_secret_once(self, monkeypatch, capsys):
        monkeypatch.setattr(voice_events, "_warned_unconfigured", False)
        for _ in range(3):
            VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID}))
        assert capsys.readouterr().out.count("PUSHER_SECRET is not set") == 1

    def test_none_when_the_call_names_no_channel(self, monkeypatch, pusher_built):
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")
        assert VoiceEvents.for_call(call_with({"platform": "web"})) is None

    def test_builds_the_client_from_defaults_and_the_secret(self, monkeypatch, pusher_built):
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")
        for var in ("PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_CLUSTER"):
            monkeypatch.delenv(var, raising=False)
        events = VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID}))
        assert events is not None and events.channel == CHANNEL
        assert pusher_built == [
            {
                "app_id": voice_events.DEFAULT_APP_ID,
                "key": voice_events.DEFAULT_KEY,
                "secret": "test-secret",
                "cluster": voice_events.DEFAULT_CLUSTER,
                "ssl": True,
                "timeout": voice_events.PUSHER_TIMEOUT_S,
                "backend": voice_events._CertifiBackend,
            }
        ]

    def test_env_overrides_the_defaults(self, monkeypatch, pusher_built):
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")
        monkeypatch.setenv("PUSHER_APP_ID", "99")
        monkeypatch.setenv("PUSHER_KEY", "other-key")
        monkeypatch.setenv("PUSHER_CLUSTER", "eu")
        VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID}))
        (kwargs,) = pusher_built
        assert (kwargs["app_id"], kwargs["key"], kwargs["cluster"]) == ("99", "other-key", "eu")

    def test_calls_share_one_client(self, monkeypatch, pusher_built):
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")
        a = VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID}))
        b = VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID.replace("1", "2")}))
        assert a._client is b._client
        assert len(pusher_built) == 1

    def test_the_real_client_builds_without_the_network(self, monkeypatch):
        # Building the client makes no request; only trigger() does.
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")
        assert VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID})) is not None

    def test_tls_is_checked_against_certifi(self, monkeypatch):
        # Not the root list bundled in the library in 2021.
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")
        VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID}))
        assert voice_events._client._pusher_client.http.options["verify"] == certifi.where()

    def test_a_bad_override_turns_events_off_instead_of_failing(self, monkeypatch, capsys):
        # for_call runs before the greeting; it must never raise.
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")

        def refuse(**kwargs):
            raise ValueError("bad cluster")

        monkeypatch.setattr(voice_events.pusher, "Pusher", refuse)
        assert VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID})) is None
        assert "Pusher client not built: ValueError: bad cluster" in capsys.readouterr().out

    def test_a_client_that_failed_to_build_is_not_retried_every_call(self, monkeypatch, capsys):
        monkeypatch.setenv("PUSHER_SECRET", "test-secret")
        attempts = []

        def refuse(**kwargs):
            attempts.append(kwargs)
            raise ValueError("bad cluster")

        monkeypatch.setattr(voice_events.pusher, "Pusher", refuse)
        for _ in range(3):
            assert VoiceEvents.for_call(call_with({"events_channel": CHANNEL_ID})) is None
        assert len(attempts) == 1
        assert capsys.readouterr().out.count("Pusher client not built") == 1


# --- the browser's half of the contract --------------------------------------

CLIENT_EVENTS_TS = Path(__file__).resolve().parents[2] / "client" / "src" / "lib" / "voice-events.ts"


class TestClientParity:
    """client/src/lib/voice-events.ts must name the same channel, events and
    metadata field as this module, or calls connect and the page never moves."""

    @pytest.fixture
    def source(self):
        if not CLIENT_EVENTS_TS.exists():
            pytest.skip("no client checkout next to the server")
        return CLIENT_EVENTS_TS.read_text(encoding="utf-8")

    def test_same_channel_prefix(self, source):
        assert f'CHANNEL_PREFIX = "{voice_events.CHANNEL_PREFIX}"' in source

    def test_same_default_app(self, source):
        assert f'|| "{voice_events.DEFAULT_KEY}"' in source
        assert f'|| "{voice_events.DEFAULT_CLUSTER}"' in source

    def test_same_event_names(self, source):
        assert 'channel.bind("navigation"' in source
        assert 'channel.bind("transcript"' in source

    def test_same_metadata_field(self, source):
        assert "events_channel: id" in source
        assert channel_for(call_with({"events_channel": CHANNEL_ID})) == CHANNEL

    def test_same_transcript_line_fields(self, source):
        # The browser drops a line without these, so a rename here would
        # leave the call panel empty.
        (line,) = caption_window([{"role": "agent", "content": "Hi."}])
        assert set(line) == {"index", "role", "content"}
        assert "const { index, role, content } = line" in source
