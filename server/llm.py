import os
import json
import traceback
from typing import Any, List

from agents import (
    Agent,
    RawResponsesStreamEvent,
    RunItemStreamEvent,
    Runner,
    ModelSettings,
)
from openai.types.shared import Reasoning

from firetrace import traced_run


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
    guardrail_refusal_message,
    reminder_prompt,
    text_system_prompt,
    voice_system_prompt,
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
]


class LlmClient:
    def __init__(self, call_id: str, mode: str = "voice", debug=None):
        self.call_id = call_id
        self.mode = mode
        # Retell's call_details payload (agent id, call type, the metadata the
        # browser attached when it created the call). main.py fills this in on
        # the first websocket message; every turn's trace carries it.
        self.call_details: dict = {}

        # The prompt varies by mode; the model and reasoning effort do not —
        # both come from model_config so there is one place to change them.
        system_prompt = voice_system_prompt if mode == "voice" else text_system_prompt

        # Create the main agent with input guardrails
        self.agent = Agent(
            name="portfolio_agent",
            instructions=system_prompt,
            model=AGENT_MODEL,
            tools=self.prepare_functions(),
            input_guardrails=[security_guardrail],
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
            last_user_message = (
                f"User question:{last_user_message}\n\n"
                "Always respond in plain conversational text. No special symbols or markdown."
                "This is a VOICE conversation - every character you type will be spoken aloud."
            )
            prompt[last_user_message_index]["content"] = last_user_message

        if request.interaction_type == "reminder_required":
            prompt.append({"role": "user", "content": reminder_prompt})
        return prompt

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

    def _call_metadata(self) -> dict:
        """Trace metadata from Retell's call_details, when the call sent them."""
        details = self.call_details if isinstance(self.call_details, dict) else {}
        meta: dict = {}
        for key in ("agent_id", "call_type"):
            if details.get(key):
                meta[f"retell.{key}"] = details[key]
        custom = details.get("metadata")
        if isinstance(custom, dict) and custom:
            meta["retell.metadata"] = custom
        return meta

    def _user_id(self) -> str | None:
        """A user id, if the browser attached one to the call. None today."""
        details = self.call_details if isinstance(self.call_details, dict) else {}
        custom = details.get("metadata")
        if isinstance(custom, dict):
            uid = custom.get("user_id") or custom.get("userId")
            return str(uid) if uid else None
        return None

    @staticmethod
    def _run_output(
        text_parts: List[str], tool_calls: List[dict], refusal_parts: List[str] | None = None
    ) -> dict:
        """The run's result as stored on its trace: final text plus tool calls."""
        output: dict = {"text": "".join(text_parts)}
        if refusal_parts:
            output["refusal"] = "".join(refusal_parts)
        if tool_calls:
            output["tool_calls"] = tool_calls
        return output

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

        # One FireTrace trace per turn, grouped by call id so a whole
        # conversation can be pulled up by sessionId. The Agents SDK's own
        # trace (and the OpenAI dashboard export) rides inside it.
        with traced_run(
            "portfolio_voice_response",
            session_id=self.call_id,
            user_id=self._user_id(),
            model=AGENT_MODEL,
            input={
                "interaction_type": request.interaction_type,
                "response_id": response_id,
                "transcript": [
                    {"role": u.role, "content": u.content} for u in request.transcript
                ],
            },
            metadata={
                "mode": self.mode,
                "response_id": str(response_id),
                "interaction_type": request.interaction_type,
                **self._call_metadata(),
            },
            tags=("voice", request.interaction_type),
        ) as run:
            text_parts: List[str] = []
            tool_calls: List[dict] = []
            refusal_parts: List[str] = []
            try:
                # Runner.run_streamed returns a RunResultStreaming object synchronously
                # The guardrails will be checked automatically before the agent runs
                result = Runner.run_streamed(self.agent, messages)

                async for event in result.stream_events():
                    if isinstance(event, RawResponsesStreamEvent):
                        data = event.data
                        event_type = getattr(data, "type", "")
                        if event_type == "response.output_text.delta":
                            # For streaming, pass through the delta as-is
                            # The AI has been instructed not to use markdown in the prompts
                            delta_content = getattr(data, "delta", "")
                            if delta_content:
                                text_parts.append(delta_content)
                                yield ResponseResponse(
                                    response_id=response_id,
                                    content=delta_content,
                                    content_complete=False,
                                    end_call=False,
                                )
                        elif event_type == "response.refusal.delta":
                            # Not spoken (nothing is yielded), but recorded on
                            # the trace so an empty answer can be explained.
                            refusal_parts.append(getattr(data, "delta", "") or "")

                    elif isinstance(event, RunItemStreamEvent):
                        if event.name == "tool_called":
                            tool_call = event.item.raw_item
                            call_id = getattr(
                                tool_call, "call_id", getattr(tool_call, "id", "")
                            )
                            name = getattr(tool_call, "name", "")
                            args = getattr(tool_call, "arguments", "") or ""
                            tool_calls.append({"name": name, "arguments": args})

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
                            yield ToolCallResultResponse(
                                tool_call_id=call_id,
                                content=str(output_item.output),
                            )

            except Exception as e:
                # Check if it's a guardrail tripwire trigger
                if "InputGuardrailTripwireTriggered" in str(type(e).__name__):
                    self._log("Guardrail triggered: Request blocked due to security check")
                    run.mark_guardrail_blocked(output={"text": guardrail_refusal_message})
                    yield ResponseResponse(
                        response_id=response_id,
                        content=guardrail_refusal_message,
                        content_complete=True,
                        end_call=False,
                    )
                    return

                print(
                    f"Error creating agent stream: {e}\n{traceback.format_exc()}",
                    flush=True,
                )
                run.set_error(e)
                yield ResponseResponse(
                    response_id=response_id,
                    content="",
                    content_complete=True,
                    end_call=False,
                )
                return

            run.set_output(self._run_output(text_parts, tool_calls, refusal_parts))

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

    async def draft_text_response(self, messages: List[dict]):
        """
        Generate a streaming response for text chat (non-voice).
        Yields TextChatStreamChunk objects for SSE streaming.

        Args:
            messages: List of message dicts with 'role' and 'content' keys
        """
        from custom_types import TextChatStreamChunk

        self._log(
            f"draft_text_response: call_id={self.call_id} messages={len(messages)}",
            flush=True,
        )

        # Handle empty messages case
        if not messages:
            messages = [{"role": "user", "content": "Hello"}]

        # Add instruction to the last user message for text chat
        # Encourage markdown formatting for better readability
        processed_messages = []
        for i, msg in enumerate(messages):
            if i == len(messages) - 1 and msg.get("role") == "user":
                processed_messages.append({
                    "role": "user",
                    "content": f"User question: {msg['content']}\n\nThis is a TEXT chat. Use markdown formatting: **bold** for emphasis, `code` for tech terms, and bullet points for lists.",
                })
            else:
                processed_messages.append(msg)

        with traced_run(
            "portfolio_text_response",
            session_id=self.call_id,
            model=AGENT_MODEL,
            input={"messages": messages},
            metadata={"mode": self.mode, "message_count": str(len(processed_messages))},
            tags=("text",),
        ) as run:
            text_parts: List[str] = []
            tool_calls: List[dict] = []
            refusal_parts: List[str] = []
            try:
                result = Runner.run_streamed(self.agent, processed_messages)

                yield TextChatStreamChunk(type="status", content="Thinking...")

                async for event in result.stream_events():
                    if isinstance(event, RawResponsesStreamEvent):
                        data = event.data
                        event_type = getattr(data, "type", "")
                        if event_type == "response.output_text.delta":
                            delta_content = getattr(data, "delta", "")
                            if delta_content:
                                self._log(f"text content delta: {len(delta_content)} chars")
                                text_parts.append(delta_content)
                                yield TextChatStreamChunk(
                                    type="content",
                                    content=delta_content,
                                )
                        elif event_type == "response.refusal.delta":
                            refusal_parts.append(getattr(data, "delta", "") or "")

                    elif isinstance(event, RunItemStreamEvent):
                        if event.name == "tool_called":
                            tool_call = event.item.raw_item
                            name = getattr(tool_call, "name", "")
                            args = getattr(tool_call, "arguments", "") or ""
                            tool_calls.append({"name": name, "arguments": args})

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
                # Check if it's a guardrail tripwire trigger
                if "InputGuardrailTripwireTriggered" in str(type(e).__name__):
                    self._log("Guardrail triggered: Request blocked due to security check")
                    run.mark_guardrail_blocked(output={"text": guardrail_refusal_message})
                    yield TextChatStreamChunk(
                        type="content",
                        content=guardrail_refusal_message,
                    )
                    yield TextChatStreamChunk(type="done")
                    return

                print(
                    f"Error in text chat stream: {e}\n{traceback.format_exc()}",
                    flush=True,
                )
                run.set_error(e)
                yield TextChatStreamChunk(
                    type="error",
                    content="An error occurred. Please try again.",
                )
                return

            run.set_output(self._run_output(text_parts, tool_calls, refusal_parts))

        # Signal completion
        yield TextChatStreamChunk(type="done")
        self._log("text chat response complete", flush=True)
