"""The Retell LLM websocket (main.websocket_handler) feeding voice_events.py.

The agent is a fake that yields fixed events, and the outbox is a recorder, so
these tests check only main.py's wiring: which Retell messages become which
browser events."""

import asyncio
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from custom_types import MetadataResponse, ResponseResponse, ToolCallInvocationResponse

CHANNEL_ID = "123e4567-e89b-42d3-a456-426614174000"
WS_PATH = f"/{os.environ.get('OBFUSCATED_WS_PATH', 'ws-default')}/call_abc"

NAV_RESUME = {"type": "navigation", "page": "resume"}
NAV_EDUCATION = {"type": "navigation", "page": "education"}


class RecordingEvents:
    """Stands in for VoiceEvents."""

    def __init__(self):
        self.navigations = []
        self.transcripts = []
        self.closed = False

    def navigation(self, meta):
        self.navigations.append(meta)

    def transcript(self, transcript):
        self.transcripts.append(transcript)

    async def aclose(self):
        self.closed = True


class FakeLlm:
    """Yields a navigation for each turn. Turn 1 is slow when `slow_first` is
    set, so a second turn can arrive while it's still running."""

    slow_first = False

    def __init__(self, call_id, mode="voice", debug=None):
        self.call_id = call_id
        self.call_details = {}

    def draft_begin_message(self):
        return ResponseResponse(response_id=0, content="Hi!", content_complete=True, end_call=False)

    async def draft_response(self, request):
        nav = NAV_RESUME if request.response_id == 1 else NAV_EDUCATION
        if request.response_id == 1 and FakeLlm.slow_first:
            # main.py stops a replaced turn after the first event it sends, so
            # the navigation goes first to reach the check that matters.
            await asyncio.sleep(0.5)
            yield MetadataResponse(metadata=nav)
            return
        yield ToolCallInvocationResponse(tool_call_id=f"t{request.response_id}", name="display", arguments="{}")
        yield MetadataResponse(metadata=nav)
        yield ResponseResponse(
            response_id=request.response_id, content="Here.", content_complete=True, end_call=False
        )


@pytest.fixture
def voice_ws():
    """A websocket client for main.py with the fake agent and a recording outbox."""
    import main

    FakeLlm.slow_first = False
    recorder = RecordingEvents()
    calls = []

    def for_call(call):
        calls.append(call)
        return recorder

    with patch.object(main, "LlmClient", FakeLlm), patch.object(main.VoiceEvents, "for_call", for_call):
        yield TestClient(main.app), recorder, calls


def open_call(client, metadata):
    ws = client.websocket_connect(WS_PATH)
    conn = ws.__enter__()
    assert conn.receive_json()["response_type"] == "config"
    conn.send_json({"interaction_type": "call_details", "call": {"call_id": "call_abc", "metadata": metadata}})
    assert conn.receive_json()["content"] == "Hi!"
    return ws, conn


def read_turn(conn, response_id):
    """Read until this turn's final response; return every message seen."""
    seen = []
    while True:
        msg = conn.receive_json()
        seen.append(msg)
        if msg.get("response_type") == "response" and msg.get("response_id") == response_id:
            return seen


def transcript_update(*lines):
    return {
        "interaction_type": "update_only",
        "transcript": [{"role": role, "content": content, "words": []} for role, content in lines],
        "turntaking": "agent_turn",
    }


def test_call_details_open_the_outbox_with_the_calls_metadata(voice_ws):
    client, recorder, calls = voice_ws
    ws, conn = open_call(client, {"events_channel": CHANNEL_ID})
    ws.__exit__(None, None, None)
    assert calls == [{"call_id": "call_abc", "metadata": {"events_channel": CHANNEL_ID}}]
    assert recorder.closed


def test_transcript_updates_become_captions(voice_ws):
    client, recorder, _ = voice_ws
    ws, conn = open_call(client, {"events_channel": CHANNEL_ID})
    update = transcript_update(("agent", "Hi!"), ("user", "Show me your resume"))
    conn.send_json(update)
    conn.send_json({"interaction_type": "response_required", "response_id": 1, "transcript": []})
    read_turn(conn, 1)
    ws.__exit__(None, None, None)
    assert recorder.transcripts == [update["transcript"]]


def test_a_page_move_goes_to_retell_and_to_the_browser(voice_ws):
    client, recorder, _ = voice_ws
    ws, conn = open_call(client, {"events_channel": CHANNEL_ID})
    conn.send_json({"interaction_type": "response_required", "response_id": 1, "transcript": []})
    seen = read_turn(conn, 1)
    ws.__exit__(None, None, None)
    # Retell still gets the metadata (v2 calls in old tabs use it until Sep 30).
    assert {"response_type": "metadata", "metadata": NAV_RESUME} in seen
    assert recorder.navigations == [NAV_RESUME]


def test_a_page_move_from_a_replaced_reply_is_not_sent(voice_ws):
    client, recorder, _ = voice_ws
    FakeLlm.slow_first = True
    ws, conn = open_call(client, {"events_channel": CHANNEL_ID})
    conn.send_json({"interaction_type": "response_required", "response_id": 1, "transcript": []})
    # The visitor kept talking: Retell asks for a new reply before turn 1's
    # navigation is out.
    conn.send_json({"interaction_type": "response_required", "response_id": 2, "transcript": []})
    read_turn(conn, 2)
    # Turn 1 wakes up and sends its navigation to Retell, which is harmless,
    # but it must not reach the browser: turn 2 already moved the page.
    msg = conn.receive_json()
    assert msg == {"response_type": "metadata", "metadata": NAV_RESUME}
    ws.__exit__(None, None, None)
    assert recorder.navigations == [NAV_EDUCATION]


def test_without_a_channel_the_call_still_works():
    """The real for_call: no events_channel and no PUSHER_SECRET, so no outbox."""
    import main
    import voice_events

    with patch.object(main, "LlmClient", FakeLlm):
        FakeLlm.slow_first = False
        ws, conn = open_call(TestClient(main.app), {"platform": "web"})
        conn.send_json(transcript_update(("user", "Hi")))
        conn.send_json({"interaction_type": "response_required", "response_id": 1, "transcript": []})
        seen = read_turn(conn, 1)
        ws.__exit__(None, None, None)
    assert {"response_type": "metadata", "metadata": NAV_RESUME} in seen
    assert voice_events._client is None
