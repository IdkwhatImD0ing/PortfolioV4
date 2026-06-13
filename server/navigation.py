"""Maps LLM tool calls to navigation metadata sent to the client.

This is the single source of truth for the wire contract between the agent
and the frontend. The frontend's PAGE_TO_SECTION mapping in
client-new/src/lib/voice-bus.ts must accept every `page` value this
module can emit.
"""

import json
from typing import Optional


# Tool name → (page value sent to client). project is handled separately
# because it carries an `id` argument.
_PAGE_TOOLS: dict[str, str] = {
    "display_homepage": "personal",
    "display_landing_page": "landing",
    "display_education_page": "education",
    "display_resume_page": "resume",
    "display_hackathons_page": "hackathon",
    "display_architecture_page": "architecture",
}


def tool_call_to_metadata(name: str, args: str = "") -> Optional[dict]:
    """Convert a streamed tool call to the navigation metadata dict the
    frontend consumes, or None if the tool isn't a navigation tool.

    Args:
        name: The tool function name, e.g. "display_project".
        args: The raw JSON-encoded arguments string from the LLM. Only used
            by ``display_project`` to extract the project ``id``.

    Returns:
        A dict matching ``{"type": "navigation", "page": ..., "project_id"?: ...}``
        ready to be wrapped in a MetadataResponse / TextChatStreamChunk, or
        None for non-navigation tools (e.g. ``search_projects``).
    """
    page = _PAGE_TOOLS.get(name)
    if page is not None:
        return {"type": "navigation", "page": page}

    if name == "display_project":
        try:
            args_dict = json.loads(args) if args else {}
            project_id = args_dict.get("id", "")
        except (json.JSONDecodeError, ValueError, TypeError):
            # Malformed args — still navigate to the projects view, just no
            # specific project. Matches the prior best-effort behavior.
            return {"type": "navigation", "page": "project"}
        return {"type": "navigation", "page": "project", "project_id": project_id}

    return None


# Page values this module is allowed to emit. Useful for parity tests.
NAVIGATION_PAGES: frozenset[str] = frozenset(
    list(_PAGE_TOOLS.values()) + ["project"]
)
