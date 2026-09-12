"""
Tests for llm.py - LlmClient and utility functions.
"""

import copy

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from llm import clean_markdown, LlmClient
from custom_types import Utterance, ResponseRequiredRequest


class TestCleanMarkdown:
    """Tests for the clean_markdown utility function."""

    def test_empty_string(self):
        """Test that empty string returns empty string."""
        assert clean_markdown("") == ""

    def test_none_returns_none(self):
        """Test that None returns None."""
        assert clean_markdown(None) is None

    def test_plain_text_unchanged(self):
        """Test that plain text without markdown is unchanged."""
        text = "Hello, this is plain text."
        assert clean_markdown(text) == text

    def test_removes_bold_asterisks(self):
        """Test removal of bold markdown with asterisks."""
        assert clean_markdown("This is **bold** text") == "This is bold text"

    def test_removes_bold_underscores(self):
        """Test removal of bold markdown with underscores."""
        assert clean_markdown("This is __bold__ text") == "This is bold text"

    def test_removes_italic_asterisks(self):
        """Test removal of italic markdown with asterisks."""
        assert clean_markdown("This is *italic* text") == "This is italic text"

    def test_removes_italic_underscores(self):
        """Test removal of italic markdown with underscores."""
        assert clean_markdown("This is _italic_ text") == "This is italic text"

    def test_removes_inline_code(self):
        """Test removal of inline code backticks."""
        assert clean_markdown("Use the `print()` function") == "Use the print() function"

    def test_removes_links(self):
        """Test removal of markdown links, keeping link text."""
        assert clean_markdown("Check out [GitHub](https://github.com)") == "Check out GitHub"

    def test_removes_headers(self):
        """Test removal of markdown headers."""
        assert clean_markdown("# Header One") == "Header One"
        assert clean_markdown("## Header Two") == "Header Two"
        assert clean_markdown("### Header Three") == "Header Three"

    def test_removes_list_markers_asterisk(self):
        """Test removal of asterisk list markers."""
        assert clean_markdown("* Item one") == "Item one"

    def test_removes_list_markers_dash(self):
        """Test removal of dash list markers."""
        assert clean_markdown("- Item one") == "Item one"

    def test_removes_list_markers_plus(self):
        """Test removal of plus list markers."""
        assert clean_markdown("+ Item one") == "Item one"

    def test_removes_numbered_list(self):
        """Test removal of numbered list markers."""
        assert clean_markdown("1. First item") == "First item"
        assert clean_markdown("10. Tenth item") == "Tenth item"

    def test_complex_mixed_markdown(self):
        """Test cleaning text with multiple markdown elements."""
        text = "**Bold** and *italic* with `code` and [link](http://example.com)"
        expected = "Bold and italic with code and link"
        assert clean_markdown(text) == expected


class TestLlmClientInit:
    """Tests for LlmClient initialization."""

    @patch("llm.Agent")
    def test_init_voice_mode(self, mock_agent):
        """Test LlmClient initializes correctly in voice mode."""
        client = LlmClient(call_id="test-123", mode="voice")
        
        assert client.call_id == "test-123"
        assert client.mode == "voice"
        mock_agent.assert_called_once()

    @patch("llm.Agent")
    def test_init_text_mode(self, mock_agent):
        """Test LlmClient initializes correctly in text mode."""
        client = LlmClient(call_id="test-456", mode="text")
        
        assert client.call_id == "test-456"
        assert client.mode == "text"

    @patch("llm.Agent")
    def test_debug_from_env(self, mock_agent):
        """Test that debug mode can be set from environment."""
        with patch.dict("os.environ", {"LLM_DEBUG": "1"}):
            client = LlmClient(call_id="test", debug=None)
            assert client.debug is True

    @patch("llm.Agent")
    def test_debug_override(self, mock_agent):
        """Test that debug can be explicitly overridden."""
        client = LlmClient(call_id="test", debug=True)
        assert client.debug is True
        
        client = LlmClient(call_id="test", debug=False)
        assert client.debug is False


class TestLlmClientDraftBeginMessage:
    """Tests for draft_begin_message method."""

    @patch("llm.Agent")
    def test_draft_begin_message_returns_response(self, mock_agent):
        """Test that draft_begin_message returns a valid response."""
        client = LlmClient(call_id="test-123", mode="voice")
        response = client.draft_begin_message()
        
        assert response.response_type == "response"
        assert response.response_id == 0
        assert response.content_complete is True
        assert response.end_call is False
        assert len(response.content) > 0


class TestLlmClientConvertTranscript:
    """Tests for convert_transcript_to_openai_messages method."""

    @patch("llm.Agent")
    def test_empty_transcript(self, mock_agent):
        """Test converting empty transcript."""
        client = LlmClient(call_id="test", mode="voice")
        result = client.convert_transcript_to_openai_messages([])
        assert result == []

    @patch("llm.Agent")
    def test_agent_to_assistant(self, mock_agent):
        """Test that agent role is converted to assistant."""
        client = LlmClient(call_id="test", mode="voice")
        transcript = [Utterance(role="agent", content="Hello!")]
        
        result = client.convert_transcript_to_openai_messages(transcript)
        
        assert len(result) == 1
        assert result[0]["role"] == "assistant"
        assert result[0]["content"] == "Hello!"

    @patch("llm.Agent")
    def test_user_remains_user(self, mock_agent):
        """Test that user role remains user."""
        client = LlmClient(call_id="test", mode="voice")
        transcript = [Utterance(role="user", content="Hi there")]
        
        result = client.convert_transcript_to_openai_messages(transcript)
        
        assert len(result) == 1
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "Hi there"

    @patch("llm.Agent")
    def test_mixed_transcript(self, mock_agent):
        """Test converting transcript with mixed roles."""
        client = LlmClient(call_id="test", mode="voice")
        transcript = [
            Utterance(role="agent", content="Hello!"),
            Utterance(role="user", content="Hi, tell me about projects"),
            Utterance(role="agent", content="Sure, let me show you."),
        ]
        
        result = client.convert_transcript_to_openai_messages(transcript)
        
        assert len(result) == 3
        assert result[0]["role"] == "assistant"
        assert result[1]["role"] == "user"
        assert result[2]["role"] == "assistant"


class TestLlmClientPreparePrompt:
    """Tests for prepare_prompt method."""

    @patch("llm.Agent")
    @patch("llm.voice_system_prompt", "Test system prompt")
    def test_prepare_prompt_response_required(self, mock_agent):
        """Test preparing prompt for response_required interaction."""
        # Patch the system_prompt variable in the llm module scope
        import llm
        llm.system_prompt = "Test system prompt for voice"
        
        client = LlmClient(call_id="test", mode="voice")
        request = ResponseRequiredRequest(
            interaction_type="response_required",
            response_id=1,
            transcript=[
                Utterance(role="agent", content="Hello!"),
                Utterance(role="user", content="Tell me about Bill"),
            ],
        )
        
        result = client.prepare_prompt(request)
        
        # Should have transcript messages (system prompt is in agent.instructions, not here)
        assert len(result) >= 2
        assert result[0]["role"] == "assistant"  # agent -> assistant
        assert result[1]["role"] == "user"

    @patch("llm.Agent")
    def test_prepare_prompt_reminder_required(self, mock_agent):
        """Test preparing prompt for reminder_required adds reminder message."""
        import llm
        llm.system_prompt = "Test system prompt"
        
        client = LlmClient(call_id="test", mode="voice")
        request = ResponseRequiredRequest(
            interaction_type="reminder_required",
            response_id=1,
            transcript=[
                Utterance(role="agent", content="Hello!"),
            ],
        )
        
        result = client.prepare_prompt(request)
        
        # Last message should be the reminder prompt
        assert "not responded in a while" in result[-1]["content"]

    @patch("llm.Agent")
    def test_prepare_prompt_empty_transcript(self, mock_agent):
        """Test preparing prompt with empty transcript."""
        import llm
        llm.system_prompt = "Test system prompt"
        
        client = LlmClient(call_id="test", mode="voice")
        request = ResponseRequiredRequest(
            interaction_type="response_required",
            response_id=1,
            transcript=[],
        )
        
        result = client.prepare_prompt(request)
        
        # Empty transcript returns empty list (system prompt is in agent.instructions)
        assert len(result) == 0


class TestLlmClientPrepareFunctions:
    """Tests for prepare_functions method."""

    @patch("llm.Agent")
    def test_prepare_functions_returns_tools(self, mock_agent):
        """Test that prepare_functions returns expected tools."""
        client = LlmClient(call_id="test", mode="voice")
        tools = client.prepare_functions()

        expected_tool_names = {
            "display_education_page",
            "display_hackathons_page",
            "display_homepage",
            "display_landing_page",
            "display_resume_page",
            "display_architecture_page",
            "display_project",
            "search_projects",
            "get_project_details",
        }
        tool_names = {getattr(t, "name", getattr(t, "__name__", str(t))) for t in tools}
        assert tool_names == expected_tool_names
        assert len(tools) == len(expected_tool_names)


class TestTextModeSendsVisitorWordsUnchanged:
    """The visitor's turns reach the agent, and so the guardrail, as typed.

    draft_text_response used to rewrite the last user turn to "User question: {q}
    ... This is a TEXT chat. Use markdown formatting: ...". The input guardrail
    classifies that turn, so the judge was reading our formatting instruction as
    the visitor's own words, and it measurably changed verdicts on questions about
    Bill's projects.
    """

    @patch("llm.Agent")
    async def test_messages_are_passed_through_verbatim(self, mock_agent):
        client = LlmClient(call_id="t", mode="text")
        captured = {}

        def fake_run_streamed(agent, messages):
            captured["messages"] = messages
            raise RuntimeError("stop after capture")

        messages = [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hey"},
            {"role": "user", "content": "Tell me more about Dispatch AI."},
        ]
        # Snapshot first. The captured list shares its dicts with `messages`, so
        # comparing the two would pass even if the turn were rewritten in place.
        expected = copy.deepcopy(messages)
        with patch("llm.Runner.run_streamed", side_effect=fake_run_streamed):
            async for _ in client.draft_text_response(messages):
                pass

        assert captured["messages"] == expected
        assert messages == expected

    def test_markdown_guidance_still_reaches_the_text_agent(self):
        """Dropping the wrapper must not drop the instruction it carried."""
        from prompts import text_system_prompt

        assert "markdown" in text_system_prompt.lower()
        assert "**bold**" in text_system_prompt
