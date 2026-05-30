"""Tests for the LLM tool-call → navigation metadata contract.

This module is the wire boundary between the agent and the frontend, so the
tests check every tool name the prompt advertises plus the edge cases that
have historically broken (malformed JSON, missing id, search/non-nav tools).
"""

import pytest

from navigation import tool_call_to_metadata, NAVIGATION_PAGES


# --------------------------------------------------------------------------- #
# Page tools                                                                  #
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "tool_name,expected_page",
    [
        ("display_homepage", "personal"),
        ("display_landing_page", "landing"),
        ("display_education_page", "education"),
        ("display_resume_page", "resume"),
        ("display_hackathons_page", "hackathon"),
        ("display_architecture_page", "architecture"),
    ],
)
def test_page_tools_map_to_expected_page(tool_name, expected_page):
    meta = tool_call_to_metadata(tool_name)
    assert meta == {"type": "navigation", "page": expected_page}


def test_page_tools_ignore_args():
    # Page tools take no arguments; an args string should not affect output.
    assert tool_call_to_metadata("display_resume_page", '{"id": "ignored"}') == {
        "type": "navigation",
        "page": "resume",
    }


# --------------------------------------------------------------------------- #
# display_project                                                             #
# --------------------------------------------------------------------------- #

def test_display_project_with_id():
    meta = tool_call_to_metadata("display_project", '{"id": "dispatch-ai"}')
    assert meta == {
        "type": "navigation",
        "page": "project",
        "project_id": "dispatch-ai",
    }


def test_display_project_with_pinecone_slug_id():
    # The agent typically emits Pinecone canonical IDs (with random suffixes).
    meta = tool_call_to_metadata("display_project", '{"id": "sentinelai-dec0jp"}')
    assert meta["project_id"] == "sentinelai-dec0jp"


def test_display_project_empty_args():
    # No args at all — still navigate, just no specific project.
    meta = tool_call_to_metadata("display_project", "")
    assert meta == {"type": "navigation", "page": "project", "project_id": ""}


def test_display_project_missing_id_key():
    # Valid JSON but no `id` key — project_id should be empty string.
    meta = tool_call_to_metadata("display_project", '{"other": "value"}')
    assert meta == {"type": "navigation", "page": "project", "project_id": ""}


def test_display_project_malformed_json_falls_back():
    # If the LLM emitted malformed args, fall back to a generic project nav
    # without a project_id field (matches the pre-refactor behavior).
    meta = tool_call_to_metadata("display_project", "{not valid json")
    assert meta == {"type": "navigation", "page": "project"}
    assert "project_id" not in meta


def test_display_project_with_additional_keys():
    # Extra keys in args should be ignored; only `id` matters.
    meta = tool_call_to_metadata(
        "display_project", '{"id": "talktuahbank", "extra": true}'
    )
    assert meta == {
        "type": "navigation",
        "page": "project",
        "project_id": "talktuahbank",
    }


# --------------------------------------------------------------------------- #
# Non-navigation tools                                                        #
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "tool_name",
    ["search_projects", "unknown_tool", "", "display_homepage_typo"],
)
def test_non_navigation_tools_return_none(tool_name):
    assert tool_call_to_metadata(tool_name) is None
    assert tool_call_to_metadata(tool_name, '{"id": "x"}') is None


# --------------------------------------------------------------------------- #
# Invariants                                                                  #
# --------------------------------------------------------------------------- #

def test_every_nav_metadata_carries_navigation_type():
    """Every dispatch result must declare `type: "navigation"` so the client
    can dispatch off a single field."""
    for tool_name in [
        "display_homepage",
        "display_landing_page",
        "display_education_page",
        "display_resume_page",
        "display_hackathons_page",
        "display_architecture_page",
        "display_project",
    ]:
        meta = tool_call_to_metadata(tool_name, '{"id": "x"}')
        assert meta is not None and meta["type"] == "navigation"


def test_navigation_pages_set_matches_emitted_pages():
    """The exported NAVIGATION_PAGES set should equal the set of pages any
    tool call can produce. Guards against silently adding a new tool that
    doesn't get added to the invariant."""
    emitted = set()
    for tool_name in [
        "display_homepage",
        "display_landing_page",
        "display_education_page",
        "display_resume_page",
        "display_hackathons_page",
        "display_architecture_page",
        "display_project",
    ]:
        meta = tool_call_to_metadata(tool_name, '{"id": "x"}')
        if meta:
            emitted.add(meta["page"])
    assert emitted == set(NAVIGATION_PAGES)
