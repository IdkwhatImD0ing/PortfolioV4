"""Text from before and after a tool call reads as one reply.

The agent says its first sentence, calls a display tool, and goes on in a new
model response (prompts.py, section 9). That response starts with no leading
space, so without llm._spaced the two joined as "I cook.I play piano".
"""

from types import SimpleNamespace

import pytest
from agents import RawResponsesStreamEvent

from llm import LlmClient
from tests.test_guardrail_streaming import (  # noqa: F401 - fixtures
    _collect,
    _delta,
    _text,
    _visible_reply,
    _voice_request,
    agent_run,
    judge,
)


def _created() -> RawResponsesStreamEvent:
    return RawResponsesStreamEvent(data=SimpleNamespace(type="response.created"))


async def _spoken(script, agent_run, judge) -> str:
    agent_run(script)
    judge(block=False)
    client = LlmClient("call", mode="voice")
    responses = await _collect(client.draft_response(_voice_request("what do you do for fun")))
    return "".join(r.content for r in responses if not r.content_complete)


@pytest.mark.asyncio
class TestReplySpacing:
    async def test_voice_puts_a_space_after_the_tool_call(self, agent_run, judge):
        script = [_created(), _delta("Outside work, I cook."), _created(), _delta("I play"), _delta(" piano.")]
        assert await _spoken(script, agent_run, judge) == "Outside work, I cook. I play piano."

    async def test_text_puts_a_space_after_the_tool_call(self, agent_run, judge):
        agent_run([_created(), _delta("Outside work, I cook."), _created(), _delta("I play piano.")])
        judge(block=False)
        assert _visible_reply(await _collect(_text())) == "Outside work, I cook. I play piano."

    async def test_no_extra_space_when_there_already_is_one(self, agent_run, judge):
        script = [_created(), _delta("I cook. "), _created(), _delta("I play."), _created(), _delta(" Loudly.")]
        assert await _spoken(script, agent_run, judge) == "I cook. I play. Loudly."

    async def test_a_reply_that_only_starts_after_the_tool_has_no_leading_space(
        self, agent_run, judge
    ):
        script = [_created(), _created(), _delta("I play piano.")]
        assert await _spoken(script, agent_run, judge) == "I play piano."
