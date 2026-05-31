"""
Tests for main.py - FastAPI endpoints and handlers.
"""

import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestPingEndpoint:
    """Tests for the /ping health check endpoint."""

    def test_ping_returns_pong(self, app_client):
        """Test that /ping returns expected response."""
        response = app_client.get("/ping")
        
        assert response.status_code == 200
        assert response.json() == {"message": "pong"}


class TestWebhookEndpoint:
    """Tests for the /webhook endpoint."""

    def test_webhook_valid_signature_call_started(self, app_client, mock_retell):
        """Test webhook with valid signature and call_started event."""
        payload = {
            "event": "call_started",
            "data": {"call_id": "test-call-123"},
        }
        
        response = app_client.post(
            "/webhook",
            json=payload,
            headers={"X-Retell-Signature": "valid-sig"},
        )
        
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_webhook_valid_signature_call_ended(self, app_client, mock_retell):
        """Test webhook with call_ended event."""
        payload = {
            "event": "call_ended",
            "data": {"call_id": "test-call-123"},
        }
        
        response = app_client.post(
            "/webhook",
            json=payload,
            headers={"X-Retell-Signature": "valid-sig"},
        )
        
        assert response.status_code == 200

    def test_webhook_valid_signature_call_analyzed(self, app_client, mock_retell):
        """Test webhook with call_analyzed event."""
        payload = {
            "event": "call_analyzed",
            "data": {"call_id": "test-call-123"},
        }
        
        response = app_client.post(
            "/webhook",
            json=payload,
            headers={"X-Retell-Signature": "valid-sig"},
        )
        
        assert response.status_code == 200

    def test_webhook_invalid_signature(self, app_client, mock_retell):
        """Test webhook rejects invalid signature."""
        mock_retell.verify.return_value = False
        
        payload = {
            "event": "call_started",
            "data": {"call_id": "test-call-123"},
        }
        
        response = app_client.post(
            "/webhook",
            json=payload,
            headers={"X-Retell-Signature": "invalid-sig"},
        )
        
        assert response.status_code == 401
        assert response.json() == {"message": "Unauthorized"}

    def test_webhook_unknown_event(self, app_client, mock_retell):
        """Test webhook handles unknown event type."""
        payload = {
            "event": "unknown_event",
            "data": {"call_id": "test-call-123"},
        }
        
        response = app_client.post(
            "/webhook",
            json=payload,
            headers={"X-Retell-Signature": "valid-sig"},
        )
        
        assert response.status_code == 200


class TestChatEndpoint:
    """Tests for the /chat SSE endpoint."""

    def test_chat_returns_sse_response(self, app_client):
        """Test that /chat returns SSE response."""
        with patch("main.LlmClient") as mock_llm:
            # Mock the async generator
            async def mock_generator():
                from custom_types import TextChatStreamChunk
                yield TextChatStreamChunk(type="content", content="Hello")
                yield TextChatStreamChunk(type="done")
            
            mock_instance = MagicMock()
            mock_instance.draft_text_response = mock_generator
            mock_llm.return_value = mock_instance
            
            response = app_client.post(
                "/chat",
                json={
                    "messages": [
                        {"role": "user", "content": "Hello"}
                    ]
                },
            )
            
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")

    def test_chat_request_validation(self, app_client):
        """Test that /chat validates request body."""
        # Missing messages field
        response = app_client.post("/chat", json={})
        
        assert response.status_code == 422  # Validation error

    def test_chat_empty_messages(self, app_client):
        """Test /chat with empty messages array."""
        with patch("main.LlmClient") as mock_llm:
            async def mock_generator():
                from custom_types import TextChatStreamChunk
                yield TextChatStreamChunk(type="done")
            
            mock_instance = MagicMock()
            mock_instance.draft_text_response = mock_generator
            mock_llm.return_value = mock_instance
            
            response = app_client.post(
                "/chat",
                json={"messages": []},
            )
            
            assert response.status_code == 200


class TestValidateEnvironmentVariables:
    """Tests for validate_environment_variables function."""

    def test_missing_required_vars_raises(self):
        """Test that missing required vars raises ValueError."""
        from main import validate_environment_variables
        
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError) as exc_info:
                validate_environment_variables()
            
            assert "RETELL_API_KEY" in str(exc_info.value)
            assert "OPENAI_API_KEY" in str(exc_info.value)
            assert "PINECONE_API_KEY" in str(exc_info.value)

    def test_all_required_vars_set(self):
        """Test validation passes when all required vars are set."""
        from main import validate_environment_variables
        
        env_vars = {
            "RETELL_API_KEY": "test-key",
            "OPENAI_API_KEY": "test-key",
            "PINECONE_API_KEY": "test-key",
        }
        
        with patch.dict("os.environ", env_vars, clear=True):
            # Should not raise
            validate_environment_variables()


class TestCORSConfiguration:
    """Tests for CORS middleware configuration."""

    def test_cors_allows_localhost(self, app_client):
        """Test that CORS allows localhost:3000."""
        response = app_client.options(
            "/ping",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        
        # CORS preflight should succeed
        assert response.status_code in [200, 204]

    def test_cors_allows_production_domain(self, app_client):
        """Test that CORS allows production domain."""
        response = app_client.options(
            "/ping",
            headers={
                "Origin": "https://art3m1s.me",
                "Access-Control-Request-Method": "GET",
            },
        )

        assert response.status_code in [200, 204]
        assert response.headers.get("access-control-allow-origin") == "https://art3m1s.me"

    @pytest.mark.parametrize(
        "origin",
        [
            "https://www.art3m1s.me",
            "https://v3.art3m1s.me",
            "https://eatsafely.projects.art3m1s.me",
            "https://anything-else.art3m1s.me",
        ],
    )
    def test_cors_allows_any_art3m1s_subdomain(self, app_client, origin):
        """The allow_origin_regex should match the apex and any subdomain depth."""
        response = app_client.options(
            "/ping",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code in [200, 204]
        assert response.headers.get("access-control-allow-origin") == origin

    @pytest.mark.parametrize(
        "origin",
        [
            "https://art3m1s.com",          # different TLD
            "https://evil-art3m1s.me",      # not a subdomain
            "http://art3m1s.me",            # http (not https)
            "https://art3m1s.me.evil.com",  # suffix attack
        ],
    )
    def test_cors_rejects_unrelated_origins(self, app_client, origin):
        """Lookalike origins must NOT be granted CORS access."""
        response = app_client.options(
            "/ping",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        # The preflight may still return 200, but the response must NOT include
        # an Access-Control-Allow-Origin header for the rejected origin.
        assert response.headers.get("access-control-allow-origin") != origin
