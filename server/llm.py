import asyncio
import os
import json
import traceback
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from typing import Any, List

from agents import (
    Agent,
    GuardrailFunctionOutput,
    RawResponsesStreamEvent,
    RunContextWrapper,
    RunItemStreamEvent,
    Runner,
    ModelSettings,
    SpanError,
    guardrail_span,
    trace,
)
from openai.types.shared import Reasoning


from navigation import tool_call_to_metadata
from custom_types import (
    MetadataResponse,
    ResponseRequiredRequest,
    ResponseResponse,
    ToolCallInvocationResponse,
    ToolCallResultResponse,
    Utterance,
)

from prompts import (
    begin_sentence,
    guardrail_interruption_message,
    guardrail_refusal_message,
    reminder_checkin_message,
    reminder_prompt,
    text_system_prompt,
    voice_system_prompt,
    voice_turn,
)

from model_config import AGENT_MODEL, REASONING_EFFORT
from text_utils import clean_markdown
from guardrail import security_guardrail, GuardrailVerdict
from summary import generate_summary
from agent_tools import (
    display_education_page,
    display_hackathons_page,
    display_homepage,
    display_landing_page,
    display_resume_page,
    display_architecture_page,
    display_project,
    search_projects,
    get_project_details,
)

# Re-export previously-public names so the external import surface is preserved.
__all__ = [
    "LlmClient",
    "clean_markdown",
    "security_guardrail",
    "GuardrailVerdict",
    "generate_summary",
    "display_education_page",
    "display_hackathons_page",
    "display_homepage",
    "display_landing_page",
    "display_resume_page",
    "display_architecture_page",
    "display_project",
    "search_projects",
    "get_project_details",
    "AGENT_MODEL",
    "GuardrailTripped",
    "screened_stream",
]


@dataclass(frozen=True)
class GuardrailTripped:
    """The last item `screened_stream` yields when the guardrail blocks a turn.

    By the time a caller sees it, the agent run has already been cancelled (or,
    with `screen_first`, was never started). `verdict` is None when the
    screening itself crashed, which blocks.
    """

    verdict: GuardrailVerdict | None = None


async def _screen(agent: Agent, messages: list) -> GuardrailFunctionOutput:
    """Run the input guardrail once, under a guardrail span as the SDK would."""
    with guardrail_span(security_guardrail.get_name()) as span:
        result = await security_guardrail.run(
            agent, messages, RunContextWrapper(context=None)
        )
        span.span_data.triggered = result.output.tripwire_triggered
        if result.output.tripwire_triggered:
            # The SDK hook recorded this error on a trip. Keep it, so trace
            # filters on span errors still find blocked turns.
            span.set_error(
                SpanError(
                    message="Guardrail tripwire triggered",
                    data={"guardrail": security_guardrail.get_name(), "type": "input_guardrail"},
                )
            )
    return result.output


def _trip_from(screening: asyncio.Task) -> GuardrailTripped | None:
    """A finished screening task as a trip, or None if the turn is allowed."""
    try:
        output = screening.result()
    except Exception as e:  # noqa: BLE001 - anything unexpected must block
        # guardrail.py already sorts classifier failures into open and closed.
        # An exception that gets this far is a bug in our own code, and like
        # every failure not on its fail-open list, it blocks.
        print(f"[guardrail] screening crashed, blocking turn: {e!r}", flush=True)
        return GuardrailTripped()
    if output.tripwire_triggered:
        return GuardrailTripped(verdict=output.output_info)
    return None


@asynccontextmanager
async def screened_stream(agent: Agent, messages: list, *, screen_first: bool = False):
    """Run the agent and the input guardrail side by side on the same turn.

    Use as `async with screened_stream(agent, messages) as events:`. Both start
    on entry, so an allowed visitor waits on nothing extra, and both are
    stopped on exit even if `events` was never read.

    `events` yields the agent's stream events as they arrive. If the guardrail
    trips, the run is cancelled the moment the verdict lands, not when the
    caller next reads, and a `GuardrailTripped` is the last item; the caller
    decides what the visitor gets instead. If the agent finishes first,
    `events` still waits for the verdict before ending, so a caller never
    closes out a turn that is still being judged.

    With `screen_first`, the model starts only once the verdict is in, so a
    trip leaves no model output at all and `events` is just the
    `GuardrailTripped`. That puts the classifier's latency up front, so it is
    only for turns nobody is waiting on (voice idle reminders).

    This replaces the Agent's `input_guardrails` hook. On the streamed path the
    SDK runs that hook as a detached task, notices a trip only between stream
    events, and never cancels the model, so a blocked answer kept streaming and
    the refusal arrived after it.
    """
    screening = asyncio.create_task(_screen(agent, messages))
    try:
        if screen_first:
            await asyncio.wait({screening})
            trip = _trip_from(screening)
            if trip is not None:
                yield _just(trip)
                return

        result = Runner.run_streamed(agent, messages)

        def stop_on_trip(task: asyncio.Task) -> None:
            # Runs as soon as the verdict lands, even while the caller is busy
            # sending. That keeps the model from generating, and tools from
            # running, after a trip: the SDK hook's `before_side_effects` check
            # did that job before.
            if task.cancelled() or result.is_complete:
                return
            if task.exception() is not None or task.result().tripwire_triggered:
                result.cancel()

        screening.add_done_callback(stop_on_trip)
        stream = result.stream_events()
        events = _merge(stream, screening)
        try:
            yield events
        finally:
            if not result.is_complete:
                result.cancel()
            await events.aclose()
            await stream.aclose()
    finally:
        screening.cancel()
        await asyncio.gather(screening, return_exceptions=True)


async def _just(item):
    """`events` for a turn screened first and blocked: the trip, nothing else."""
    yield item


async def _merge(stream, screening: asyncio.Task):
    """The `events` of `screened_stream`: agent events, raced against the verdict."""
    pending = asyncio.ensure_future(anext(stream, None))
    agent_error = None
    try:
        # Race until the verdict is in. It is checked first, so an event that
        # lands in the same tick as a trip is dropped rather than sent.
        while not screening.done():
            watching = {screening} if pending is None else {screening, pending}
            await asyncio.wait(watching, return_when=asyncio.FIRST_COMPLETED)
            if screening.done():
                break
            try:
                event = pending.result()
            except Exception as e:  # noqa: BLE001 - re-raised below
                # Hold an agent failure until the verdict is in: a blocked
                # turn gets the refusal whether or not the agent finished.
                agent_error, pending = e, None
                continue
            if event is None:
                pending = None
                continue
            pending = asyncio.ensure_future(anext(stream, None))
            yield event

        trip = _trip_from(screening)
        if trip is not None:
            yield trip
            return
        if agent_error is not None:
            raise agent_error

        # Allowed: nothing left to race, so read the rest of the stream directly.
        if pending is not None:
            event, pending = await pending, None
            while event is not None:
                yield event
                event = await anext(stream, None)
    finally:
        if pending is not None:
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)


class LlmClient:
    def __init__(self, call_id: str, mode: str = "voice", debug=None):
        self.call_id = call_id
        self.mode = mode

        # The prompt varies by mode; the model and reasoning effort do not —
        # both come from model_config so there is one place to change them.
        system_prompt = voice_system_prompt if mode == "voice" else text_system_prompt

        # No `input_guardrails` here on purpose: `screened_stream` runs the
        # guardrail beside the run so a trip can stop it. See its docstring.
        self.agent = Agent(
            name="portfolio_agent",
            instructions=system_prompt,
            model=AGENT_MODEL,
            tools=self.prepare_functions(),
            model_settings=ModelSettings(
                verbosity="low",
                reasoning=Reasoning(
                    effort=REASONING_EFFORT,
                    summary="auto",
                ),
            ),
        )

        # Control verbose streaming logs via env or constructor
        if debug is None:
            self.debug = os.getenv("LLM_DEBUG", "0") == "1"
        else:
            self.debug = bool(debug)

    def _log(self, *args, **kwargs):
        if self.debug:
            print(*args, **kwargs, flush=True)

    def draft_begin_message(self):
        response = ResponseResponse(
            response_id=0,
            content=begin_sentence,
            content_complete=True,
            end_call=False,
        )
        return response

    def convert_transcript_to_openai_messages(self, transcript: List[Utterance]):
        messages = []
        for utterance in transcript:
            if utterance.role == "agent":
                messages.append({"role": "assistant", "content": utterance.content})
            else:
                messages.append({"role": "user", "content": utterance.content})
        return messages

    def prepare_prompt(self, request: ResponseRequiredRequest):
        # Note: System prompt is in self.agent.instructions, not here
        # This method prepares the conversation messages from the transcript
        transcript_messages = self.convert_transcript_to_openai_messages(
            request.transcript
        )
        prompt = list(transcript_messages)

        last_user_message = ""
        last_user_message_index = -1
        for i, message in enumerate(reversed(transcript_messages)):
            if message.get("role") == "user":
                last_user_message = message.get("content", "")
                last_user_message_index = len(transcript_messages) - i - 1
                break

        if last_user_message:
            prompt[last_user_message_index]["content"] = voice_turn(last_user_message)

        if request.interaction_type == "reminder_required":
            prompt.append({"role": "user", "content": reminder_prompt})
        return prompt

    @staticmethod
    def _screens_first(request: ResponseRequiredRequest) -> bool:
        """Whether the guardrail must finish before the model starts. Every request is screened.

        On a visitor turn the guardrail runs beside the model, so nobody waits on
        the judge. A reminder has nobody waiting, so it is judged before the
        model instead. A reminder re-judges the visitor's last turn, and if that
        trips, nothing the model would have said streams out first. Keyed on
        Retell's interaction_type, so /chat never takes this path.
        """
        return request.interaction_type == "reminder_required"

    def _refusal_for(self, request: ResponseRequiredRequest) -> str:
        """What the visitor hears when the guardrail trips on this request.

        A reminder adds no visitor input, so a trip there is the judge re-judging
        their previous turn. If the agent already replied to it, repeating the
        refusal would answer something they didn't just say, so they get a
        check-in. If it never replied (an agent error sends an empty reply), this
        is their first answer, so it's the refusal. Keyed on Retell's
        interaction_type, which /chat can't set; the transcript only picks
        between two fixed lines.
        """
        if request.interaction_type == "reminder_required":
            last = next(
                (u for u in reversed(request.transcript) if u.content.strip()), None
            )
            if last is not None and last.role == "agent":
                return reminder_checkin_message
        return guardrail_refusal_message

    def prepare_functions(self) -> List[Any]:
        """Return tool functions available to the agent."""
        return [
            display_education_page,
            display_hackathons_page,
            display_homepage,
            display_landing_page,
            display_resume_page,
            display_architecture_page,
            display_project,
            search_projects,
            get_project_details,
        ]

    @staticmethod
    def _tool_status_label(name: str, args: str) -> str | None:
        """Map a tool call to a user-facing status label for the text chat UI."""
        if name == "search_projects":
            return "Searching projects..."
        if name == "get_project_details":
            try:
                args_dict = json.loads(args) if args else {}
                msg = args_dict.get("message", "")
                if msg:
                    return msg
            except Exception:
                pass
            return "Pulling up project details..."
        if name == "display_architecture_page":
            return "Loading architecture..."
        if name.startswith("display_"):
            return None
        return None

    async def draft_response(self, request: ResponseRequiredRequest):
        messages = self.prepare_prompt(request)
        response_id = request.response_id

        self._log(
            f"draft_response: call_id={self.call_id} model={AGENT_MODEL} messages={len(messages)} last_user='{(request.transcript[-1].content if request.transcript else '')[:120]}'",
            flush=True,
        )

        # Handle empty transcript case
        if not messages:
            messages = [{"role": "user", "content": "Hello"}]

        spoke = False
        # Tool calls sent to Retell that haven't had their result yet. A trip
        # can cancel the run mid-tool, so these get closed out first.
        unfinished_tools: list[str] = []
        try:
            async with AsyncExitStack() as stack:
                # Create an explicit trace for this response so analytics can be grouped by call/session.
                stack.enter_context(trace(
                    workflow_name="portfolio_voice_response",
                    group_id=self.call_id,
                    metadata={"mode": self.mode, "response_id": str(response_id)},
                ))
                # The guardrail runs beside the model on visitor turns and before
                # it on reminders; see screened_stream and _screens_first.
                events = await stack.enter_async_context(
                    screened_stream(
                        self.agent, messages, screen_first=self._screens_first(request)
                    )
                )

                async for event in events:
                    if isinstance(event, GuardrailTripped):
                        self._log(f"Guardrail blocked the turn: {event.verdict}")
                        for tool_call_id in unfinished_tools:
                            yield ToolCallResultResponse(
                                tool_call_id=tool_call_id,
                                content="Cancelled: the guardrail blocked this turn.",
                            )
                        # Whatever already streamed has been spoken, and speech
                        # can't be taken back. Stop there and apologise. If
                        # nothing went out yet, give the full refusal instead.
                        yield ResponseResponse(
                            response_id=response_id,
                            content=(
                                guardrail_interruption_message
                                if spoke
                                else self._refusal_for(request)
                            ),
                            content_complete=True,
                            end_call=False,
                        )
                        return

                    if isinstance(event, RawResponsesStreamEvent):
                        data = event.data
                        if getattr(data, "type", "") == "response.output_text.delta":
                            # For streaming, pass through the delta as-is
                            # The AI has been instructed not to use markdown in the prompts
                            delta_content = getattr(data, "delta", "")
                            if delta_content:
                                spoke = True
                                yield ResponseResponse(
                                    response_id=response_id,
                                    content=delta_content,
                                    content_complete=False,
                                    end_call=False,
                                )

                    elif isinstance(event, RunItemStreamEvent):
                        if event.name == "tool_called":
                            tool_call = event.item.raw_item
                            call_id = getattr(
                                tool_call, "call_id", getattr(tool_call, "id", "")
                            )
                            name = getattr(tool_call, "name", "")
                            args = getattr(tool_call, "arguments", "") or ""

                            unfinished_tools.append(call_id)
                            yield ToolCallInvocationResponse(
                                tool_call_id=call_id,
                                name=name,
                                arguments=args,
                            )

                            nav_meta = tool_call_to_metadata(name, args)
                            if nav_meta is not None:
                                yield MetadataResponse(metadata=nav_meta)
                            elif name == "search_projects":
                                # For search_projects, we might want to send the results as metadata
                                # but since the function returns text, we'll let it be handled normally
                                pass

                        elif event.name == "tool_output":
                            output_item = event.item
                            call_id = getattr(output_item.raw_item, "call_id", "")
                            if call_id in unfinished_tools:
                                unfinished_tools.remove(call_id)
                            yield ToolCallResultResponse(
                                tool_call_id=call_id,
                                content=str(output_item.output),
                            )

        except Exception as e:
            print(
                f"Error creating agent stream: {e}\n{traceback.format_exc()}",
                flush=True,
            )
            yield ResponseResponse(
                response_id=response_id,
                content="",
                content_complete=True,
                end_call=False,
            )
            return

        # Send final response to signal completion
        yield ResponseResponse(
            response_id=response_id,
            content="",
            content_complete=True,
            end_call=False,
        )
        self._log(
            f"finalizing response_id={response_id} content_complete=True end_call=False",
            flush=True,
        )

    async def draft_text_response(self, messages: List[dict], supports_replace: bool = True):
        """
        Generate a streaming response for text chat (non-voice).
        Yields TextChatStreamChunk objects for SSE streaming.

        Args:
            messages: List of message dicts with 'role' and 'content' keys
            supports_replace: Whether the client understands `replace` chunks.
                A client that doesn't gets the refusal appended as `content`.
        """
        from custom_types import TextChatStreamChunk

        self._log(
            f"draft_text_response: call_id={self.call_id} messages={len(messages)}",
            flush=True,
        )

        # Handle empty messages case
        if not messages:
            messages = [{"role": "user", "content": "Hello"}]

        # The visitor's turns go to the agent exactly as typed. This used to
        # rewrite the last one to "User question: {q}\n\nThis is a TEXT chat.
        # Use markdown formatting: ...", but the input guardrail classifies that
        # turn, so the judge read our formatting instruction as the visitor's own
        # words, and that changed verdicts: "Tell me more about Dispatch AI." was
        # refused 3 of 6 times wrapped and 0 of 6 plain. The markdown guidance
        # already lives in text_system_prompt (prompts.py), so the wrapper added
        # nothing the agent did not already have.
        processed_messages = list(messages)

        streamed = False
        try:
            async with AsyncExitStack() as stack:
                stack.enter_context(trace(
                    workflow_name="portfolio_text_response",
                    group_id=self.call_id,
                    metadata={"mode": self.mode, "message_count": str(len(processed_messages))},
                ))
                # Starts the agent and the guardrail now, so the model request
                # overlaps the status write below. See screened_stream.
                events = await stack.enter_async_context(
                    screened_stream(self.agent, processed_messages)
                )

                yield TextChatStreamChunk(type="status", content="Thinking...")

                async for event in events:
                    if isinstance(event, GuardrailTripped):
                        self._log(f"Guardrail blocked the turn: {event.verdict}")
                        if supports_replace:
                            # Part of the answer may already be on screen.
                            # `replace` withdraws all of it, so the visitor is
                            # left with the refusal and nothing else.
                            yield TextChatStreamChunk(
                                type="replace",
                                content=guardrail_refusal_message,
                            )
                        else:
                            # A client from before `replace` would drop it and
                            # keep the answer with no refusal at all. Append
                            # the refusal instead, as this endpoint used to.
                            yield TextChatStreamChunk(
                                type="content",
                                content=("\n\n" if streamed else "") + guardrail_refusal_message,
                            )
                        break

                    if isinstance(event, RawResponsesStreamEvent):
                        data = event.data
                        event_type = getattr(data, "type", "")
                        if event_type == "response.output_text.delta":
                            delta_content = getattr(data, "delta", "")
                            if delta_content:
                                self._log(f"text content delta: {len(delta_content)} chars")
                                streamed = True
                                yield TextChatStreamChunk(
                                    type="content",
                                    content=delta_content,
                                )

                    elif isinstance(event, RunItemStreamEvent):
                        if event.name == "tool_called":
                            tool_call = event.item.raw_item
                            name = getattr(tool_call, "name", "")
                            args = getattr(tool_call, "arguments", "") or ""

                            # Emit a human-readable status for tool calls
                            status_label = self._tool_status_label(name, args)
                            if status_label:
                                yield TextChatStreamChunk(type="status", content=status_label)

                            # Send navigation metadata
                            nav_meta = tool_call_to_metadata(name, args)
                            if nav_meta is not None:
                                yield TextChatStreamChunk(
                                    type="metadata", metadata=nav_meta
                                )

                    else:
                        self._log(f"unhandled stream event: {type(event).__name__}")

        except Exception as e:
            print(
                f"Error in text chat stream: {e}\n{traceback.format_exc()}",
                flush=True,
            )
            yield TextChatStreamChunk(
                type="error",
                content="An error occurred. Please try again.",
            )
            return

        # Signal completion
        yield TextChatStreamChunk(type="done")
        self._log("text chat response complete", flush=True)
