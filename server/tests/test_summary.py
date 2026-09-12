import pytest
from unittest.mock import patch, AsyncMock
from custom_types import SummaryRequest, TextChatMessage

class TestSummaryEndpoint:
    """Tests for the /summary endpoint."""

    def test_summary_returns_response(self, app_client):
        """Test that /summary returns expected response."""
        with patch("main.generate_summary", new_callable=AsyncMock) as mock_generate:
            mock_generate.return_value = "## Summary\n\nThis is a test summary."

            payload = {
                "transcript": [
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "Hi there!"}
                ]
            }

            response = app_client.post("/summary", json=payload)

            assert response.status_code == 200
            assert response.json() == {"summary": "## Summary\n\nThis is a test summary."}
            mock_generate.assert_called_once()

    def test_summary_validation_error(self, app_client):
        """Test validation error for invalid payload."""
        response = app_client.post("/summary", json={})
        assert response.status_code == 422

    def test_summary_rejects_oversized_transcript_before_the_model(self, app_client):
        """/summary is unauthenticated; an oversized transcript must never reach the model."""
        from custom_types import MAX_SUMMARY_MESSAGES

        with patch("main.generate_summary", new_callable=AsyncMock) as mock_generate:
            response = app_client.post(
                "/summary",
                json={
                    "transcript": [{"role": "user", "content": "hi"}]
                    * (MAX_SUMMARY_MESSAGES + 1)
                },
            )

        assert response.status_code == 422
        mock_generate.assert_not_called()

    def test_summary_error_handling(self, app_client):
        """Test error handling in /summary endpoint."""
        with patch("main.generate_summary", new_callable=AsyncMock) as mock_generate:
            mock_generate.side_effect = Exception("Test error")

            payload = {
                "transcript": [
                    {"role": "user", "content": "Hello"}
                ]
            }

            response = app_client.post("/summary", json=payload)

            assert response.status_code == 500
            assert response.json() == {"error": "Test error"}
