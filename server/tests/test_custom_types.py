"""
Tests for Pydantic models in custom_types.py.
"""

import pytest
from pydantic import ValidationError

from custom_types import (
    MAX_CHAT_MESSAGE_CHARS,
    MAX_CHAT_MESSAGES,
    Utterance,
    ResponseRequiredRequest,
    ResponseResponse,
    ToolCallInvocationResponse,
    ToolCallResultResponse,
    MetadataResponse,
    TextChatMessage,
    TextChatRequest,
    TextChatStreamChunk,
    ConfigResponse,
    MAX_SUMMARY_MESSAGES,
    SummaryRequest,
)


class TestUtterance:
    """Tests for Utterance model."""

    def test_valid_agent_utterance(self):
        """Test creating a valid agent utterance."""
        utterance = Utterance(role="agent", content="Hello!")
        assert utterance.role == "agent"
        assert utterance.content == "Hello!"

    def test_valid_user_utterance(self):
        """Test creating a valid user utterance."""
        utterance = Utterance(role="user", content="Hi there")
        assert utterance.role == "user"
        assert utterance.content == "Hi there"

    def test_valid_system_utterance(self):
        """Test creating a valid system utterance."""
        utterance = Utterance(role="system", content="System message")
        assert utterance.role == "system"

    def test_invalid_role(self):
        """Test that invalid role raises validation error."""
        with pytest.raises(ValidationError):
            Utterance(role="invalid", content="test")

    def test_empty_content(self):
        """Test that empty content is allowed."""
        utterance = Utterance(role="user", content="")
        assert utterance.content == ""


class TestResponseRequiredRequest:
    """Tests for ResponseRequiredRequest model."""

    def test_valid_response_required(self):
        """Test creating a valid response_required request."""
        request = ResponseRequiredRequest(
            interaction_type="response_required",
            response_id=1,
            transcript=[Utterance(role="user", content="Hello")],
        )
        assert request.interaction_type == "response_required"
        assert request.response_id == 1
        assert len(request.transcript) == 1

    def test_valid_reminder_required(self):
        """Test creating a valid reminder_required request."""
        request = ResponseRequiredRequest(
            interaction_type="reminder_required",
            response_id=2,
            transcript=[],
        )
        assert request.interaction_type == "reminder_required"

    def test_invalid_interaction_type(self):
        """Test that invalid interaction_type raises error."""
        with pytest.raises(ValidationError):
            ResponseRequiredRequest(
                interaction_type="invalid_type",
                response_id=1,
                transcript=[],
            )


class TestResponseResponse:
    """Tests for ResponseResponse model."""

    def test_valid_response(self):
        """Test creating a valid response."""
        response = ResponseResponse(
            response_id=1,
            content="Hello!",
            content_complete=True,
            end_call=False,
        )
        assert response.response_type == "response"
        assert response.response_id == 1
        assert response.content == "Hello!"
        assert response.content_complete is True
        assert response.end_call is False

    def test_default_values(self):
        """Test default values are set correctly."""
        response = ResponseResponse(
            response_id=1,
            content="Test",
            content_complete=False,
        )
        assert response.end_call is False
        assert response.transfer_number is None

    def test_serialization(self):
        """Test model serialization."""
        response = ResponseResponse(
            response_id=1,
            content="Test",
            content_complete=True,
        )
        data = response.model_dump()
        assert data["response_type"] == "response"
        assert data["response_id"] == 1


class TestToolCallResponses:
    """Tests for tool call related response models."""

    def test_tool_call_invocation(self):
        """Test ToolCallInvocationResponse."""
        response = ToolCallInvocationResponse(
            tool_call_id="call_123",
            name="display_homepage",
            arguments='{"message": "Let me show you"}',
        )
        assert response.response_type == "tool_call_invocation"
        assert response.tool_call_id == "call_123"
        assert response.name == "display_homepage"

    def test_tool_call_result(self):
        """Test ToolCallResultResponse."""
        response = ToolCallResultResponse(
            tool_call_id="call_123",
            content="Successfully displayed homepage",
        )
        assert response.response_type == "tool_call_result"
        assert response.content == "Successfully displayed homepage"


class TestMetadataResponse:
    """Tests for MetadataResponse model."""

    def test_navigation_metadata(self):
        """Test creating navigation metadata."""
        response = MetadataResponse(
            metadata={"type": "navigation", "page": "personal"}
        )
        assert response.response_type == "metadata"
        assert response.metadata["type"] == "navigation"
        assert response.metadata["page"] == "personal"

    def test_project_navigation_metadata(self):
        """Test project navigation metadata with project_id."""
        response = MetadataResponse(
            metadata={
                "type": "navigation",
                "page": "project",
                "project_id": "test-project",
            }
        )
        assert response.metadata["project_id"] == "test-project"


class TestTextChatTypes:
    """Tests for text chat related types."""

    def test_text_chat_message_user(self):
        """Test user text chat message."""
        msg = TextChatMessage(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"

    def test_text_chat_message_assistant(self):
        """Test assistant text chat message."""
        msg = TextChatMessage(role="assistant", content="Hi there!")
        assert msg.role == "assistant"

    def test_text_chat_request(self):
        """Test text chat request with messages."""
        request = TextChatRequest(
            messages=[
                TextChatMessage(role="user", content="Hello"),
                TextChatMessage(role="assistant", content="Hi!"),
            ]
        )
        assert len(request.messages) == 2

    def test_text_chat_request_accepts_what_the_client_sends(self):
        """20 messages (MAX_HISTORY_MESSAGES in client/src/lib/text-chat.ts),
        typed ones capped at 1,000 characters by the chat input."""
        request = TextChatRequest(
            messages=[TextChatMessage(role="user", content="x" * 1_000)] * 20
        )
        assert len(request.messages) == 20

    def test_text_chat_caps_are_inclusive(self):
        request = TextChatRequest(
            messages=[{"role": "user", "content": "x" * MAX_CHAT_MESSAGE_CHARS}]
            * MAX_CHAT_MESSAGES
        )
        assert len(request.messages) == MAX_CHAT_MESSAGES

    def test_text_chat_message_rejects_oversized_content(self):
        with pytest.raises(ValidationError):
            TextChatMessage(role="user", content="x" * (MAX_CHAT_MESSAGE_CHARS + 1))

    def test_text_chat_request_rejects_too_many_messages(self):
        with pytest.raises(ValidationError):
            TextChatRequest(
                messages=[{"role": "user", "content": "hi"}] * (MAX_CHAT_MESSAGES + 1)
            )

    def test_text_chat_stream_chunk_content(self):
        """Test text chat stream chunk with content."""
        chunk = TextChatStreamChunk(type="content", content="Hello")
        assert chunk.type == "content"
        assert chunk.content == "Hello"

    def test_text_chat_stream_chunk_metadata(self):
        """Test text chat stream chunk with metadata."""
        chunk = TextChatStreamChunk(
            type="metadata",
            metadata={"type": "navigation", "page": "personal"},
        )
        assert chunk.type == "metadata"
        assert chunk.metadata["page"] == "personal"

    def test_text_chat_stream_chunk_done(self):
        """Test text chat stream done chunk."""
        chunk = TextChatStreamChunk(type="done")
        assert chunk.type == "done"
        assert chunk.content is None

    def test_text_chat_stream_chunk_error(self):
        """Test text chat stream error chunk."""
        chunk = TextChatStreamChunk(type="error", content="Something went wrong")
        assert chunk.type == "error"
        assert chunk.content == "Something went wrong"


class TestSummaryRequest:
    """Tests for the /summary request body."""

    def test_summary_cap_is_inclusive(self):
        request = SummaryRequest(
            transcript=[{"role": "user", "content": "hi"}] * MAX_SUMMARY_MESSAGES
        )
        assert len(request.transcript) == MAX_SUMMARY_MESSAGES

    def test_summary_rejects_too_many_messages(self):
        with pytest.raises(ValidationError):
            SummaryRequest(
                transcript=[{"role": "user", "content": "hi"}]
                * (MAX_SUMMARY_MESSAGES + 1)
            )


class TestConfigResponse:
    """Tests for ConfigResponse model."""

    def test_config_response(self):
        """Test creating a config response."""
        response = ConfigResponse(
            config={"auto_reconnect": True, "call_details": True}
        )
        assert response.response_type == "config"
        assert response.config["auto_reconnect"] is True
