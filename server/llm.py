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

from prompts import begin_sentence, voice_system_prompt, text_system_prompt

from text_utils import clean_markdown
from guardrail import security_guardrail, JailbreakCheckOutput
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
    "JailbreakCheckOutput",
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
]


class LlmClient:
    def __init__(self, call_id: str, mode: str = "voice", debug=None):
        self.call_id = call_id
        self.mode = mode

        # Select appropriate prompt and reasoning based on mode.
        # Voice mode disables reasoning ("none") for minimum latency on GPT-5.x.
        # Text mode uses "low" reasoning for slightly better answer quality.
        system_prompt = voice_system_prompt if mode == "voice" else text_system_prompt
        reasoning_effort = "none" if mode == "voice" else "low"

        # Create the main agent with input guardrails
        self.agent = Agent(
            name="portfolio_agent",
            instructions=system_prompt,
            model="gpt-5.4-mini",
            tools=self.prepare_functions(),
            input_guardrails=[security_guardrail],
            model_settings=ModelSettings(
                verbosity="low",
                reasoning=Reasoning(
                    effort=reasoning_effort,
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
            prompt.append(
                {
                    "role": "user",
                    "content": "(Now the user has not responded in a while, you would say:)",
                }
            )
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
            f"draft_response: call_id={self.call_id} model=gpt-5.4-mini messages={len(messages)} last_user='{(request.transcript[-1].content if request.transcript else '')[:120]}'",
            flush=True,
        )

        # Handle empty transcript case
        if not messages:
            messages = [{"role": "user", "content": "Hello"}]

        try:
            # Create an explicit trace for this response so analytics can be grouped by call/session.
            with trace(
                workflow_name="portfolio_voice_response",
                group_id=self.call_id,
                metadata={"mode": self.mode, "response_id": str(response_id)},
            ):
                # Runner.run_streamed returns a RunResultStreaming object synchronously
                # The guardrails will be checked automatically before the agent runs
                result = Runner.run_streamed(self.agent, messages)

                async for event in result.stream_events():
                    if isinstance(event, RawResponsesStreamEvent):
                        data = event.data
                        if getattr(data, "type", "") == "response.output_text.delta":
                            # For streaming, pass through the delta as-is
                            # The AI has been instructed not to use markdown in the prompts
                            delta_content = getattr(data, "delta", "")
                            if delta_content:
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
                self._log(f"Guardrail triggered: Request blocked due to security check")
                yield ResponseResponse(
                    response_id=response_id,
                    content="I can only share information about my background, education, projects, and professional experience. Feel free to ask me about my hackathon wins, work at RingCentral, or any of my technical projects!",
                    content_complete=True,
                    end_call=False,
                )
                return

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
                    "content": f"User question: {msg['content']}\n\nThis is a TEXT chat. Use markdown formatting: **bold** for emphasis, `code` for tech terms, and bullet points for lists."
                })
            else:
                processed_messages.append(msg)

        try:
            with trace(
                workflow_name="portfolio_text_response",
                group_id=self.call_id,
                metadata={"mode": self.mode, "message_count": str(len(processed_messages))},
            ):
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
            # Check if it's a guardrail tripwire trigger
            if "InputGuardrailTripwireTriggered" in str(type(e).__name__):
                self._log(f"Guardrail triggered: Request blocked due to security check")
                yield TextChatStreamChunk(
                    type="content",
                    content="I can only share information about my background, education, projects, and professional experience. Feel free to ask me about my hackathon wins, work at RingCentral, or any of my technical projects!",
                )
                yield TextChatStreamChunk(type="done")
                return

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
        self._log(f"text chat response complete", flush=True)
