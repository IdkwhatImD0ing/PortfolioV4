from typing import Any, List, Optional, Literal, Union, Dict
from pydantic import BaseModel


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


class SummaryRequest(BaseModel):
    transcript: List[TextChatMessage]
