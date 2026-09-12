from typing import Any, List, Optional, Literal, Union, Dict
from pydantic import BaseModel, Field


# Retell -> Your Server Events
class Utterance(BaseModel):
    role: Literal["agent", "user", "system"]
    content: str


class PingPongRequest(BaseModel):
    interaction_type: Literal["ping_pong"]
    timestamp: int


class CallDetailsRequest(BaseModel):
    interaction_type: Literal["call_details"]
    call: dict


class UpdateOnlyRequest(BaseModel):
    interaction_type: Literal["update_only"]
    transcript: List[Utterance]


class ResponseRequiredRequest(BaseModel):
    interaction_type: Literal["reminder_required", "response_required"]
    response_id: int
    transcript: List[Utterance]


# CustomLlmRequest = Union[
#     ResponseRequiredRequest | UpdateOnlyRequest | CallDetailsRequest | PingPongRequest
# ]

CustomLlmResponse = Union[
    ResponseRequiredRequest,
    UpdateOnlyRequest,
    CallDetailsRequest,
    PingPongRequest,
]


# Your Server -> Retell Events
class ConfigResponse(BaseModel):
    response_type: Literal["config"] = "config"
    config: Dict[str, bool] = {
        "auto_reconnect": bool,
        "call_details": bool,
    }


class PingPongResponse(BaseModel):
    response_type: Literal["ping_pong"] = "ping_pong"
    timestamp: int


class ResponseResponse(BaseModel):
    response_type: Literal["response"] = "response"
    response_id: int
    content: str
    content_complete: bool
    end_call: Optional[bool] = False
    transfer_number: Optional[str] = None


class AgentInterruptResponse(BaseModel):
    response_type: Literal["agent_interrupt"] = "agent_interrupt"
    interrupt_id: int
    content: str
    content_complete: bool
    no_interruption_allowed: Optional[bool] = None
    end_call: Optional[bool] = False
    transfer_number: Optional[str] = None
    digit_to_press: Optional[str] = None


class ToolCallInvocationResponse(BaseModel):
    response_type: Literal["tool_call_invocation"] = "tool_call_invocation"
    tool_call_id: str
    name: str
    arguments: str


class ToolCallResultResponse(BaseModel):
    response_type: Literal["tool_call_result"] = "tool_call_result"
    tool_call_id: str
    content: str


class MetadataResponse(BaseModel):
    response_type: Literal["metadata"] = "metadata"
    metadata: Dict[str, Any]


# CustomLlmResponse = Union[ConfigResponse | PingPongResponse | ResponseResponse]
CustomLlmResponse = Union[ConfigResponse, PingPongResponse, ResponseResponse, MetadataResponse]


# Text Chat Types (for non-voice chat interface)

# /chat is unauthenticated and reachable straight at the Cloud Run URL (CORS
# stops browsers, not curl), and Cloud Run accepts bodies up to 32 MiB. Every
# request is parsed and screened on the event loop and forwarded to the model,
# so bound it here. The client sends at most 20 messages (MAX_HISTORY_MESSAGES
# in client/src/lib/text-chat.ts), a typed message is at most 1,000 characters,
# and a text reply is prompted to stay under 300 words, so these leave plenty of
# headroom. Oversized requests get a 422.
#
# The client trims every message to MAX_MESSAGE_CHARS in text-chat.ts, which
# must equal MAX_CHAT_MESSAGE_CHARS (text-chat.test.ts checks). /summary reuses
# TextChatMessage, so the per-message cap applies there too.
MAX_CHAT_MESSAGES = 50
MAX_CHAT_MESSAGE_CHARS = 10_000
# The caps above only apply once the body is read and parsed, so /chat also
# refuses a body past this size with a 413 before parsing it. JSON.stringify
# writes at most 6 bytes per character (`\u00XX`), so a request inside the caps
# is about 3 MB at most and this never refuses one.
MAX_CHAT_BODY_BYTES = 4 * 1024 * 1024


class TextChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_CHAT_MESSAGE_CHARS)


class TextChatRequest(BaseModel):
    messages: List[TextChatMessage] = Field(max_length=MAX_CHAT_MESSAGES)
    # Set by clients that handle `replace` chunks. Defaults off, so a page
    # loaded before `replace` existed still gets a refusal it can show.
    supports_replace: bool = False


class TextChatStreamChunk(BaseModel):
    # "replace" withdraws every `content` chunk sent so far for this reply: the
    # client shows this chunk's `content` in its place. Sent when the guardrail
    # blocks a turn after the answer had already started streaming.
    type: Literal["content", "metadata", "done", "error", "status", "replace"]
    content: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# /summary is unauthenticated and reachable straight at the Cloud Run URL, and
# each request sends the whole transcript to the model in one call, so bound how
# many messages it takes. It was built to summarise a voice call once the call
# ends. Retell ends a call after an hour by default, and a voice reply is
# prompted to stay under 200 words, so a question and its answer take about 30
# seconds: roughly 240 messages in a full hour. 500 covers that twice over, or a
# brisk hour at 15 seconds an exchange. No client calls /summary since the
# legacy client was retired (client/docs/legacy-client-retirement.md), so there
# is no client-side number to match. Oversized requests get a 422.
MAX_SUMMARY_MESSAGES = 500


class SummaryRequest(BaseModel):
    transcript: List[TextChatMessage] = Field(max_length=MAX_SUMMARY_MESSAGES)
