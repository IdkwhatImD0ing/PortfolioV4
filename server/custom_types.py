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
class TextChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class TextChatRequest(BaseModel):
    messages: List[TextChatMessage]


class TextChatStreamChunk(BaseModel):
    type: Literal["content", "metadata", "done", "error", "status"]
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
