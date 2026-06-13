"""
Shared pytest fixtures for backend tests.
Provides mocks for external services (OpenAI, Pinecone, Retell).
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

# Set test environment variables before importing app modules
os.environ.setdefault("RETELL_API_KEY", "test-retell-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("PINECONE_API_KEY", "test-pinecone-key")


@pytest.fixture(autouse=True)
def reset_pinecone_index():
    """Reset cached Pinecone state in project_search after each test."""
    try:
        import project_search
        yield
        project_search._index_host = None
    except ImportError:
        # If project_search cannot be imported, just yield
        yield


@pytest.fixture
def mock_openai_embeddings():
    """Mock OpenAI embeddings API."""
    with patch("project_search.openai_client") as mock_client:
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1] * 3072)]  # 3072-dim for text-embedding-3-large

        async def async_create(*args, **kwargs):
            return mock_response

        mock_client.embeddings.create.side_effect = async_create
        yield mock_client


@pytest.fixture
def mock_pinecone():
    """Mock Pinecone async client and index."""
    with patch("project_search.pc") as mock_pc, patch(
        "project_search._resolve_index_host",
        new=AsyncMock(return_value="test-index-host"),
    ):
        mock_index = MagicMock()
        mock_index.query = AsyncMock()
        mock_index.fetch = AsyncMock()

        # Mock query results
        mock_match = MagicMock()
        mock_match.id = "test-project"
        mock_match.score = 0.95
        mock_match.metadata = {
            "name": "Test Project",
            "summary": "A test project for unit testing",
            "details": "This is a detailed description of the test project.",
            "github": "https://github.com/test/project",
        }

        mock_query_result = MagicMock()
        mock_query_result.matches = [mock_match]
        mock_index.query.return_value = mock_query_result

        # Mock fetch results
        mock_vector = MagicMock()
        mock_vector.metadata = mock_match.metadata
        mock_fetch_result = MagicMock()
        mock_fetch_result.vectors = {"test-project": mock_vector}
        mock_index.fetch.return_value = mock_fetch_result

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_index
        mock_context.__aexit__.return_value = None
        mock_pc.IndexAsyncio.return_value = mock_context

        yield mock_index


@pytest.fixture
def mock_retell():
    """Mock Retell SDK."""
    with patch("main.retell") as mock_retell:
        mock_retell.verify.return_value = True
        yield mock_retell


@pytest.fixture
def sample_utterances():
    """Sample transcript utterances for testing."""
    from custom_types import Utterance
    return [
        Utterance(role="agent", content="Hello! I'm Bill Zhang's AI assistant."),
        Utterance(role="user", content="Tell me about your projects."),
    ]


@pytest.fixture
def sample_response_request(sample_utterances):
    """Sample ResponseRequiredRequest for testing."""
    from custom_types import ResponseRequiredRequest
    return ResponseRequiredRequest(
        interaction_type="response_required",
        response_id=1,
        transcript=sample_utterances,
    )


@pytest.fixture
def sample_text_messages():
    """Sample text chat messages for testing."""
    return [
        {"role": "user", "content": "Hello, tell me about Bill's education."},
    ]


@pytest.fixture
def mock_websocket():
    """Mock WebSocket for testing."""
    mock_ws = AsyncMock()
    mock_ws.accept = AsyncMock()
    mock_ws.send_json = AsyncMock()
    mock_ws.receive_json = AsyncMock(return_value={
        "interaction_type": "ping_pong",
        "timestamp": 12345,
    })
    mock_ws.iter_json = AsyncMock(return_value=iter([]))
    return mock_ws


@pytest.fixture
def app_client():
    """Create a test client for the FastAPI app."""
    from main import app
    return TestClient(app)


@pytest.fixture
async def async_app_client():
    """Create an async test client for the FastAPI app."""
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
