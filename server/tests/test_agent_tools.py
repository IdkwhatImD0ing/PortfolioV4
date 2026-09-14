"""
Tests for agent_tools.py - what the project tools tell the model.

The persona reasons from these strings. prompts.py section 11 says a project a
search didn't return isn't Bill's, so a search outage has to read as an outage.
When it came back as "No projects found", the persona disowned real projects.
"""

import json
import logging
from unittest.mock import patch

import pytest
from agents.tool_context import ToolContext

from agent_tools import PROJECT_SEARCH_UNAVAILABLE, get_project_details, search_projects


async def invoke(tool, **args):
    """Call a @tool the way the Agents SDK does: JSON arguments in, string out."""
    payload = json.dumps(args)
    ctx = ToolContext(
        context=None,
        tool_name=tool.name,
        tool_call_id="call_test",
        tool_arguments=payload,
    )
    return await tool.on_invoke_tool(ctx, payload)


class TestSearchProjectsTool:
    """Tests for the search_projects tool."""

    @pytest.mark.asyncio
    async def test_lists_projects_when_search_works(self, mock_openai_embeddings, mock_pinecone):
        """A healthy search lists what it found."""
        result = await invoke(search_projects, query="AI projects", message="Searching")

        assert result.startswith("Found 1 relevant projects")
        assert "Project ID: test-project" in result
        assert "Name: Test Project" in result

    @pytest.mark.asyncio
    async def test_pinecone_outage_says_unavailable(self, mock_openai_embeddings, mock_pinecone):
        """A Pinecone failure is reported as an outage, not as "no projects found"."""
        mock_pinecone.query.side_effect = Exception("503 Service Unavailable")

        result = await invoke(search_projects, query="CourtVision", message="Searching")

        assert result == PROJECT_SEARCH_UNAVAILABLE
        assert "No projects found" not in result
        # The raw error used to be echoed to the model. It stays in the server log.
        assert "503" not in result

    @pytest.mark.asyncio
    async def test_embedding_outage_says_unavailable(self, mock_openai_embeddings, mock_pinecone):
        """The OpenAI embedding call failing is the same outage."""
        mock_openai_embeddings.embeddings.create.side_effect = Exception("connection reset")

        result = await invoke(search_projects, query="CourtVision", message="Searching")

        assert result == PROJECT_SEARCH_UNAVAILABLE

    @pytest.mark.asyncio
    async def test_empty_index_says_unavailable(self, mock_openai_embeddings, mock_pinecone):
        """A working index always returns its closest projects. Empty means the index is broken."""
        mock_pinecone.query.return_value.matches = []

        result = await invoke(search_projects, query="CourtVision", message="Searching")

        assert result == PROJECT_SEARCH_UNAVAILABLE

    @pytest.mark.asyncio
    async def test_unexpected_error_says_unavailable_and_logs(
        self, mock_openai_embeddings, mock_pinecone, caplog
    ):
        """A bug past the search itself still must not read as "no such project"."""
        with patch("agent_tools.clean_markdown", side_effect=TypeError("boom")):
            with caplog.at_level(logging.ERROR, logger="agent_tools"):
                result = await invoke(search_projects, query="CourtVision", message="Searching")

        assert result == PROJECT_SEARCH_UNAVAILABLE
        assert "search_projects failed" in caplog.text
        assert "TypeError: boom" in caplog.text


class TestGetProjectDetailsTool:
    """Tests for the get_project_details tool."""

    @pytest.mark.asyncio
    async def test_returns_details_when_lookup_works(self, mock_pinecone):
        """A healthy lookup returns the project."""
        result = await invoke(get_project_details, project_id="test-project", message="Getting details")

        assert result.startswith("Project ID: test-project")
        assert "Project: Test Project" in result

    @pytest.mark.asyncio
    async def test_pinecone_outage_says_unavailable(self, mock_pinecone):
        """The flagship path skips search and calls this first, so it needs the same outage message."""
        mock_pinecone.fetch.side_effect = Exception("503 Service Unavailable")

        result = await invoke(get_project_details, project_id="dispatch-ai", message="Getting details")

        assert result == PROJECT_SEARCH_UNAVAILABLE
        assert "Could not find" not in result

    @pytest.mark.asyncio
    async def test_unknown_id_still_says_not_found(self, mock_pinecone):
        """A working index that lacks the ID is a real miss and stays distinct from an outage."""
        mock_pinecone.fetch.return_value.vectors = {}

        result = await invoke(get_project_details, project_id="made-up-id", message="Getting details")

        assert result == "Could not find project with ID: made-up-id"


def test_prompt_names_the_outage_the_tool_reports():
    """The persona's rule keys on the words the tools actually return.

    Reword one without the other and the persona stops recognising the outage.
    """
    from prompts import base_prompt

    phrase = "project search is temporarily unavailable"
    assert phrase in PROJECT_SEARCH_UNAVAILABLE.lower()
    assert phrase in base_prompt
