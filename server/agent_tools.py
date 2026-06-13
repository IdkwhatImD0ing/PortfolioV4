from agents import function_tool as tool

from text_utils import clean_markdown
from project_search import search_projects as search_projects_impl, get_project_by_id

__all__ = [
    "display_resume_page",
    "display_education_page",
    "display_homepage",
    "display_hackathons_page",
    "display_landing_page",
    "display_architecture_page",
    "display_project",
    "get_project_details",
    "search_projects",
]


@tool
def display_resume_page() -> str:
    """Displays Bill's resume page on the frontend."""
    return "Successfully displayed the resume page"


@tool
def display_education_page() -> str:
    """Displays the education page on the frontend."""
    return "Successfully displayed the education page"


@tool
def display_homepage() -> str:
    """Displays Bill's personal homepage on the frontend."""
    return "Successfully displayed the personal homepage"


@tool
def display_hackathons_page() -> str:
    """Displays the hackathons map page on the frontend, showing Bill's hackathon journey across the US."""
    return "Successfully displayed the hackathons page"


@tool
def display_landing_page() -> str:
    """Displays the landing page on the frontend - the initial voice-driven portfolio page."""
    return "Successfully displayed the landing page"


@tool
def display_architecture_page() -> str:
    """Displays the architecture / 'how it works' page on the frontend, showing
    an interactive diagram of the portfolio's tech stack and request flow.
    """
    return "Successfully displayed the architecture page"


@tool
def display_project(id: str) -> str:
    """
    Displays a specific project on the frontend.

    Args:
        id: The unique project ID to display (e.g. "interviewgpt", "getitdone", "assignmenttracker")

    Returns:
        Confirmation message that the project was displayed
    """
    return f"Successfully displayed project: {id}"


@tool
async def get_project_details(project_id: str, message: str) -> str:
    """
    Get full details about a specific project by its ID or name.
    Use this after searching to get complete information about a project.

    Args:
        project_id: The unique project ID (e.g. "dispatch-ai", "interviewgpt", "getitdone") or project name
        message: Optional status text for non-voice UI while fetching details.

    Returns:
        Full project details including the real project ID, name, summary, and complete details.
        IMPORTANT: Use the "Project ID" from the response for any subsequent display_project calls.
    """
    try:
        project = await get_project_by_id(project_id)

        if not project:
            return f"Could not find project with ID: {project_id}"

        clean_name = clean_markdown(project["name"])
        clean_summary = clean_markdown(project["summary"])
        clean_details = clean_markdown(project["details"])

        response = f"Project ID: {project['id']}\n"
        response += f"Project: {clean_name}\n\n"
        response += f"Summary: {clean_summary}\n\n"
        response += f"Details: {clean_details}"

        return response.strip()

    except Exception as e:
        return f"Error fetching project details: {str(e)}"


@tool
async def search_projects(query: str, message: str, num_results: int = 3) -> str:
    """
    Search for Bill Zhang's projects based on a query. Returns summaries only.
    Use this when users ask about specific types of projects, technologies, or want to know what Bill has worked on.
    For listing queries (e.g. "list all your X projects"), just present these results directly.
    For detail queries about a specific project, use get_project_details after searching.

    Args:
        query: Description of what kind of projects to search for (e.g. "AI projects", "hackathon winners", "web development")
        message: Optional status text for non-voice UI while searching.
        num_results: How many projects to return (3-10). Use 3 for specific lookups, 5-10 for listing or broad queries.

    Returns:
        String description of matching projects with id, name, and summary only
    """
    try:
        top_k = max(3, min(10, num_results))
        results = await search_projects_impl(query, top_k=top_k)

        if not results:
            return "No projects found matching that query."

        response = f"Found {len(results)} relevant projects:\n\n"

        for i, project in enumerate(results, 1):
            # Clean markdown from the project info
            clean_name = clean_markdown(project["name"])
            clean_summary = clean_markdown(project["summary"])

            response += f"{i}. Project ID: {project['id']}\n"
            response += f"   Name: {clean_name}\n"
            response += f"   Summary: {clean_summary}\n"
            response += "\n"

        return response.strip()

    except Exception as e:
        return f"Error searching projects: {str(e)}"
