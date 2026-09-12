"""
How a guardrail trip reaches the visitor while the answer is streaming.

The agent streams at once and the guardrail judges the same turn beside it
(`llm.screened_stream`). These tests pin what happens when the two race:

- text chat: a trip withdraws every content chunk already sent with a single
  `replace` chunk holding the refusal, and nothing from the agent follows it;
- voice: a trip stops the answer where it is and the apology follows;
- an allowed turn pays nothing for the check, and the reply is not closed out
  until the verdict is in.

The guardrail is always the real `security_guardrail` with only the classifier
call mocked, gated so each test decides who wins the race. Most tests fake the
agent run; `TestRealRunner` drives the SDK's own Runner with a slow fake model,
which is the setup that reproduces the production bug on the old code.
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from agents import (
    GuardrailFunctionOutput,
    Model,
    RawResponsesStreamEvent,
    RunItemStreamEvent,
)
from openai.types.responses import (
    Response,
    ResponseCompletedEvent,
    ResponseOutputMessage,
    ResponseOutputText,
    ResponseTextDeltaEvent,
)

import llm
from custom_types import ResponseRequiredRequest, Utterance
from llm import LlmClient
from prompts import guardrail_interruption_message, guardrail_refusal_message
from tests.test_guardrail import _classifier_result


def _delta(text: str) -> RawResponsesStreamEvent:
    return RawResponsesStreamEvent(
        data=SimpleNamespace(type="response.output_text.delta", delta=text)
    )


class FakeRun:
    """Stands in for the SDK's RunResultStreaming.

    `script` is played in order: stream events are yielded, an asyncio.Event
    pauses the "model" until it is set, and an exception is raised.
    """

    def __init__(self, script):
        self.script = script
        self.is_complete = False
        self.cancelled = False

    def cancel(self, mode="immediate"):
        self.cancelled = True
        self.is_complete = True

    async def stream_events(self):
        for step in self.script:
            if isinstance(step, asyncio.Event):
                await step.wait()
            elif isinstance(step, Exception):
                raise step
            else:
                yield step
        self.is_complete = True


@pytest.fixture
def agent_run():
    """Patch the agent's Runner; call the fixture with a script to set the run."""
    with patch("llm.Runner") as runner:

        def start(script):
            run = FakeRun(script)
            runner.run_streamed.return_value = run
            return run

        start.runner = runner
        yield start


@pytest.fixture
def judge():
    """Patch the classifier; returns a setter for its verdict and release gate."""
    with patch("guardrail.Runner") as runner:

        def set_verdict(block: bool, gate: asyncio.Event | None = None):
            async def classify(*args, **kwargs):
                if gate is not None:
                    await gate.wait()
                return _classifier_result(block)

            runner.run = AsyncMock(side_effect=classify)

        yield set_verdict


async def _collect(stream, on_item=None, timeout: float = 2.0) -> list:
    """Drain an async generator, failing rather than hanging if it stalls.

    `on_item(items)` runs after each item arrives, so a test can release the
    verdict at an exact point in the stream.
    """
    items: list = []

    async def drain():
        async for item in stream:
            items.append(item)
            if on_item is not None:
                on_item(items)

    await asyncio.wait_for(drain(), timeout)
    return items


def _after_content(count: int, gate: asyncio.Event):
    """An `on_item` that opens `gate` once `count` content chunks are out."""

    def check(items):
        if sum(getattr(i, "type", "") == "content" for i in items) >= count:
            gate.set()

    return check


def _visible_reply(chunks) -> str:
    """What the chat panel ends up showing, folded the way the client does."""
    reply = ""
    for chunk in chunks:
        if chunk.type == "content":
            reply += chunk.content or ""
        elif chunk.type == "replace":
            reply = chunk.content or ""
    return reply


def _voice_request(text: str) -> ResponseRequiredRequest:
    return ResponseRequiredRequest(
        interaction_type="response_required",
        response_id=7,
        transcript=[Utterance(role="user", content=text)],
    )


COVER_LETTER = [{"role": "user", "content": "Write my cover letter for a job at Google."}]


def _text(messages=COVER_LETTER):
    return LlmClient("t", mode="text").draft_text_response(messages)


@pytest.mark.asyncio
class TestTextChat:
    async def test_trip_mid_answer_withdraws_everything_already_sent(
        self, agent_run, judge
    ):
        """The production bug: the forbidden answer streamed, then the refusal.

        The verdict lands after two chunks of the answer are out. The visitor
        must be left looking at the refusal alone, the model must stop (the
        third chunk sits behind a gate nobody opens), and no agent content may
        follow the `replace`.
        """
        verdict = asyncio.Event()
        run = agent_run(
            [_delta("Dear hiring"), _delta(" manager, I am"), asyncio.Event(), _delta(" thrilled")]
        )
        judge(block=True, gate=verdict)

        chunks = await _collect(_text(), on_item=_after_content(2, verdict))

        assert [c.type for c in chunks] == ["status", "content", "content", "replace", "done"]
        assert _visible_reply(chunks) == guardrail_refusal_message
        assert run.cancelled

    async def test_trip_stops_the_model_while_the_caller_is_busy(self, agent_run, judge):
        """The model stops when the verdict lands, not when the caller next reads.

        The caller takes one chunk and then sits on it, as it would while a
        slow network send drains. The trip must cancel the run anyway, so no
        tool runs for a turn that is already blocked.
        """
        verdict = asyncio.Event()
        run = agent_run([_delta("Dear hiring"), asyncio.Event()])
        judge(block=True, gate=verdict)

        stream = _text()
        assert (await asyncio.wait_for(anext(stream), 2)).type == "status"
        assert (await asyncio.wait_for(anext(stream), 2)).type == "content"
        verdict.set()
        await asyncio.sleep(0.05)  # the verdict lands; the stream is not read

        assert run.cancelled
        await stream.aclose()

    async def test_client_without_replace_gets_the_refusal_appended(self, agent_run, judge):
        """A page from before `replace` would drop it and show the answer alone.

        So a client that didn't opt in gets the old behaviour: the refusal as
        one more content chunk, in its own paragraph after the answer.
        """
        verdict = asyncio.Event()
        agent_run([_delta("Dear hiring manager,"), asyncio.Event()])
        judge(block=True, gate=verdict)

        client = LlmClient("t", mode="text")
        chunks = await _collect(
            client.draft_text_response(COVER_LETTER, supports_replace=False),
            on_item=_after_content(1, verdict),
        )

        assert [c.type for c in chunks] == ["status", "content", "content", "done"]
        assert chunks[2].content == "\n\n" + guardrail_refusal_message

    async def test_the_model_starts_before_the_status_is_sent(self, agent_run, judge):
        """The model request overlaps the "Thinking..." write instead of waiting on it."""
        agent_run([_delta("I built")])
        judge(block=False)

        stream = _text([{"role": "user", "content": "What did you build?"}])
        first = await asyncio.wait_for(anext(stream), 2)

        assert first.type == "status"
        agent_run.runner.run_streamed.assert_called_once()
        await stream.aclose()

    async def test_trip_after_the_answer_finished_still_replaces_it(
        self, agent_run, judge
    ):
        """The classifier can be slower than the whole answer.

        That is what production showed: 50-70 chunks, then the refusal. The
        reply must not be closed out with `done` before the verdict, or the
        client would keep the answer. The run finished on its own here, so
        there was nothing to cancel.
        """
        verdict = asyncio.Event()
        asyncio.get_running_loop().call_later(0.05, verdict.set)
        run = agent_run([_delta("Dear hiring manager,"), _delta(" I am thrilled.")])
        judge(block=True, gate=verdict)

        chunks = await _collect(_text())

        assert [c.type for c in chunks] == ["status", "content", "content", "replace", "done"]
        assert _visible_reply(chunks) == guardrail_refusal_message
        assert not run.cancelled

    async def test_trip_before_the_first_token_sends_no_agent_content(
        self, agent_run, judge
    ):
        """A fast verdict means the visitor never sees a word of the answer."""
        agent_run([asyncio.Event(), _delta("Dear hiring manager,")])
        judge(block=True)

        chunks = await _collect(_text())

        assert [c.type for c in chunks] == ["status", "replace", "done"]
        assert chunks[1].content == guardrail_refusal_message

    async def test_allowed_turn_streams_before_the_verdict_is_in(
        self, agent_run, judge
    ):
        """No added time-to-first-token for legitimate visitors.

        The verdict is only released once the first chunk has arrived. Code
        that waited for the verdict before streaming would sit until the
        classifier timeout, so that timeout is raised past the test's limit.
        """
        verdict = asyncio.Event()
        agent_run([_delta("I built"), _delta(" Dispatch AI.")])
        judge(block=False, gate=verdict)

        with patch("guardrail.CLASSIFIER_TIMEOUT_SECONDS", 30):
            chunks = await _collect(
                _text([{"role": "user", "content": "What did you build at hackathons?"}]),
                on_item=_after_content(1, verdict),
            )

        assert [c.type for c in chunks] == ["status", "content", "content", "done"]
        assert _visible_reply(chunks) == "I built Dispatch AI."

    async def test_screening_crash_fails_closed(self, agent_run):
        """An exception escaping the guardrail is a bug, and bugs block."""
        agent_run([_delta("Dear hiring manager,")])
        with patch("llm._screen", AsyncMock(side_effect=RuntimeError("boom"))):
            chunks = await _collect(_text())

        # The crash and the first chunk land together, and the block goes first.
        assert [c.type for c in chunks] == ["status", "replace", "done"]
        assert _visible_reply(chunks) == guardrail_refusal_message

    async def test_agent_error_on_a_blocked_turn_still_gets_the_refusal(
        self, agent_run, judge
    ):
        """An agent failure mid-answer must not leave the partial answer up.

        The error is held until the verdict. A trip wins, so the visitor sees
        the refusal, not their half-written cover letter plus an error.
        """
        verdict = asyncio.Event()
        agent_run([_delta("Dear hiring manager,"), RuntimeError("model fell over")])
        judge(block=True, gate=verdict)

        chunks = await _collect(_text(), on_item=_after_content(1, verdict))

        assert [c.type for c in chunks] == ["status", "content", "replace", "done"]
        assert _visible_reply(chunks) == guardrail_refusal_message

    async def test_agent_error_on_an_allowed_turn_is_still_an_error(
        self, agent_run, judge
    ):
        agent_run([_delta("I built"), RuntimeError("model fell over")])
        judge(block=False)

        chunks = await _collect(_text([{"role": "user", "content": "What did you build?"}]))

        assert chunks[-1].type == "error"
        assert not any(c.type == "replace" for c in chunks)


@pytest.mark.asyncio
class TestVoice:
    async def test_trip_mid_answer_stops_and_apologises(self, agent_run, judge):
        """Speech can't be withdrawn, so the answer stops and the apology follows.

        Nothing from the agent comes after the apology, the apology closes the
        response, and there is no second closing response behind it.
        """
        verdict = asyncio.Event()
        run = agent_run(
            [_delta("Sure, dear hiring"), _delta(" manager,"), asyncio.Event(), _delta(" I am")]
        )
        judge(block=True, gate=verdict)

        client = LlmClient("call", mode="voice")
        responses = await _collect(
            client.draft_response(_voice_request("write my cover letter")),
            on_item=lambda items: len(items) == 2 and verdict.set(),
        )

        assert [r.content for r in responses] == [
            "Sure, dear hiring",
            " manager,",
            guardrail_interruption_message,
        ]
        assert [r.content_complete for r in responses] == [False, False, True]
        assert all(r.response_id == 7 for r in responses)
        assert run.cancelled

    async def test_trip_before_speaking_gives_the_full_refusal(self, agent_run, judge):
        agent_run([asyncio.Event(), _delta("Sure, dear hiring manager,")])
        judge(block=True)

        client = LlmClient("call", mode="voice")
        responses = await _collect(client.draft_response(_voice_request("write my cover letter")))

        assert len(responses) == 1
        assert responses[0].content == guardrail_refusal_message
        assert responses[0].content_complete is True
        assert responses[0].response_id == 7

    async def test_a_block_and_a_chunk_ready_together_block_wins(self, agent_run):
        """When the verdict and the first word land in the same tick, no word goes out.

        Both are ready on the first loop turn here: the screening returns a
        trip without ever suspending, and the model's first chunk is already
        queued. Checking the verdict second would speak "Sure" to a blocked turn.
        """
        agent_run([_delta("Sure"), asyncio.Event()])
        tripped = GuardrailFunctionOutput(output_info=None, tripwire_triggered=True)
        with patch("llm._screen", AsyncMock(return_value=tripped)):
            client = LlmClient("call", mode="voice")
            responses = await _collect(client.draft_response(_voice_request("write it")))

        assert [r.content for r in responses] == [guardrail_refusal_message]

    async def test_hanging_up_mid_answer_cancels_everything(self, agent_run, judge):
        """main.py abandons a reply when a newer one is needed; so does a closed tab.

        Closing the stream mid-answer must cancel the model run and the pending
        screening, and leave no task running behind it.
        """
        run = agent_run([_delta("I built"), _delta(" Dispatch"), asyncio.Event()])
        judge(block=False, gate=asyncio.Event())  # the verdict never arrives

        stream = LlmClient("call", mode="voice").draft_response(_voice_request("what did you build"))
        await asyncio.wait_for(anext(stream), 2)
        await asyncio.wait_for(anext(stream), 2)
        await asyncio.wait_for(stream.aclose(), 2)

        assert run.cancelled
        leftovers = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        assert leftovers == []

    async def test_cancelling_the_caller_mid_answer_cancels_everything(self, agent_run, judge):
        """main.py cancels every handle_message task when the websocket drops.

        That cancellation lands while the stream waits inside asyncio.wait. It
        must still stop the model run and the screening, leaving no task behind.
        """
        run = agent_run([_delta("I built"), asyncio.Event()])
        judge(block=False, gate=asyncio.Event())  # the verdict never arrives
        got_first = asyncio.Event()

        async def handle_message():
            client = LlmClient("call", mode="voice")
            async for _ in client.draft_response(_voice_request("what did you build")):
                got_first.set()

        task = asyncio.create_task(handle_message())
        await asyncio.wait_for(got_first.wait(), 2)
        await asyncio.sleep(0.01)  # let it go back to waiting on the stream
        task.cancel()
        await asyncio.wait_for(asyncio.gather(task, return_exceptions=True), 2)

        assert task.cancelled()
        assert run.cancelled
        leftovers = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        assert leftovers == []

    async def test_trip_mid_tool_call_closes_the_call_before_apologising(self, agent_run, judge):
        """Retell must not be left holding a tool call that never got its result."""
        verdict = asyncio.Event()
        tool_call = RunItemStreamEvent(
            name="tool_called",
            item=SimpleNamespace(
                raw_item=SimpleNamespace(call_id="call_1", name="search_projects", arguments="{}")
            ),
        )
        agent_run([_delta("Let me look."), tool_call, asyncio.Event()])
        judge(block=True, gate=verdict)

        client = LlmClient("call", mode="voice")
        responses = await _collect(
            client.draft_response(_voice_request("find me a cover letter template")),
            on_item=lambda items: items[-1].response_type == "tool_call_invocation"
            and verdict.set(),
        )

        assert [r.response_type for r in responses] == [
            "response",
            "tool_call_invocation",
            "tool_call_result",
            "response",
        ]
        assert responses[2].tool_call_id == "call_1"
        assert responses[-1].content == guardrail_interruption_message

    async def test_allowed_answer_closes_after_the_verdict(self, agent_run, judge):
        """The closing response waits for the verdict, which lands last here."""
        verdict = asyncio.Event()
        asyncio.get_running_loop().call_later(0.05, verdict.set)
        agent_run([_delta("I built Dispatch AI.")])
        judge(block=False, gate=verdict)

        client = LlmClient("call", mode="voice")
        responses = await _collect(client.draft_response(_voice_request("what did you build")))

        assert [(r.content, r.content_complete) for r in responses] == [
            ("I built Dispatch AI.", False),
            ("", True),
        ]
        assert verdict.is_set()


class SlowModel(Model):
    """A model that streams one text chunk every `interval` seconds.

    `sent` counts chunks that left the model and `finished` flips only if the
    whole answer got out, so a test can tell a cancelled run from one that was
    merely ignored.
    """

    def __init__(self, chunks: list[str], interval: float):
        self.chunks = chunks
        self.interval = interval
        self.sent = 0
        self.finished = False

    async def get_response(self, *args, **kwargs):
        raise NotImplementedError("only the streamed path is used")

    async def stream_response(self, *args, **kwargs):
        for i, text in enumerate(self.chunks):
            await asyncio.sleep(self.interval)
            self.sent += 1
            yield ResponseTextDeltaEvent(
                type="response.output_text.delta",
                item_id="msg",
                output_index=0,
                content_index=0,
                delta=text,
                sequence_number=i,
                logprobs=[],
            )
        self.finished = True
        message = ResponseOutputMessage(
            id="msg",
            type="message",
            role="assistant",
            status="completed",
            content=[
                ResponseOutputText(
                    type="output_text", text="".join(self.chunks), annotations=[]
                )
            ],
        )
        yield ResponseCompletedEvent(
            type="response.completed",
            sequence_number=len(self.chunks),
            response=Response(
                id="resp",
                created_at=0,
                model="slow-fake",
                object="response",
                output=[message],
                parallel_tool_calls=False,
                tool_choice="auto",
                tools=[],
            ),
        )


@pytest.mark.asyncio
class TestRealRunner:
    """The SDK's own Runner, a slow model, and a verdict that lands mid-answer.

    This is the production shape: before the fix, this setup streamed the
    first chunks, kept the model running to the end, and then appended the
    refusal to the answer instead of replacing it.
    """

    async def test_trip_mid_answer_cancels_the_real_run(self, judge):
        model = SlowModel([f" word{i}" for i in range(40)], interval=0.02)
        verdict = asyncio.Event()
        asyncio.get_running_loop().call_later(0.15, verdict.set)
        judge(block=True, gate=verdict)

        client = LlmClient("t", mode="text")
        client.agent = client.agent.clone(model=model)
        chunks = await _collect(client.draft_text_response(COVER_LETTER), timeout=5)

        types = [c.type for c in chunks]
        assert types[-2:] == ["replace", "done"]
        assert "content" not in types[types.index("replace") :]
        assert _visible_reply(chunks) == guardrail_refusal_message
        # The model was stopped, not left to stream the rest into the void.
        assert not model.finished
        assert model.sent < len(model.chunks)


async def test_a_trip_is_recorded_as_a_span_error(judge):
    """Trace filters on span errors found blocked turns under the SDK hook; keep that."""
    for block in (True, False):
        judge(block=block)
        span_cm = MagicMock()
        with patch("llm.guardrail_span", return_value=span_cm):
            output = await llm._screen(MagicMock(), COVER_LETTER)

        span = span_cm.__enter__.return_value
        assert output.tripwire_triggered is block
        assert span.span_data.triggered is block
        if block:
            assert span.set_error.call_args.args[0]["message"] == "Guardrail tripwire triggered"
        else:
            span.set_error.assert_not_called()


def test_the_sdk_guardrail_hook_stays_off_the_agent():
    """`screened_stream` runs the guardrail; the SDK hook must not come back.

    Attached to the Agent, the hook would classify every turn a second time,
    and on the streamed path it is the hook that let answers out before the
    refusal in the first place.
    """
    assert not LlmClient("t", mode="text").agent.input_guardrails
    assert not LlmClient("t", mode="voice").agent.input_guardrails


def test_interruption_message_does_not_disclaim_hobbies():
    """Same rule as the refusal: music is on-topic here (issue #10)."""
    assert "music" in guardrail_interruption_message
    # Appended straight after a possibly cut-off word, so it must not fuse.
    assert guardrail_interruption_message.startswith(" ")
