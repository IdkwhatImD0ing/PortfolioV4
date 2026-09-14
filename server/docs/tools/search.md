# Search Tools

Documentation for the project search tools used by the LLM.

## File Location

`agent_tools.py` (registered on the agent in `llm.py`)

## Purpose

Allow the LLM to search for and retrieve project information from Pinecone vector database during conversation.

## Available Tools

### search_projects

Semantic search for projects matching a query.

```python
@tool
def search_projects(query: str, message: str) -> str:
    """Search for Bill Zhang's projects based on a query.
    
    Args:
        query: Description of what kind of projects to search for
        message: Optional status text for non-voice UI while searching
    
    Returns:
        String description of matching projects with id, name, and summary
    """
```

**Example usage:**
```python
search_projects(
    query="AI projects",
    message="Let me search for those projects"
)
```

**Returns:**
```
Found 3 relevant projects:

1. Project ID: dispatch-ai
   Name: Dispatch AI
   Summary: AI-powered emergency call handling...

2. Project ID: teachme-3p7bw1
   Name: AdaptEd
   Summary: AI-driven educational platform...

3. Project ID: talktuahbank
   Name: TalkTuahBank
   Summary: Voice-based banking assistant...
```

If the search can't run, it returns `PROJECT_SEARCH_UNAVAILABLE` instead. See
[When Pinecone Is Down](#when-pinecone-is-down).

### get_project_details

Fetch full details for a specific project.

```python
@tool
def get_project_details(project_id: str, message: str) -> str:
    """Get full details about a specific project by its ID.
    
    Args:
        project_id: The unique project ID (e.g., "dispatch-ai")
        message: Optional status text for non-voice UI while fetching
    
    Returns:
        Full project details including name, summary, and details
    """
```

**Example usage:**
```python
get_project_details(
    project_id="dispatch-ai",
    message="Let me tell you more about that project"
)
```

**Returns:**
```
Project: Dispatch AI

Summary: AI-powered emergency call handling...

Details: Inspiration
Imagine: A major earthquake hits...
```

## Implementation

### search_projects

```python
async def search_projects(query: str, message: str, num_results: int = 3) -> str:
    try:
        top_k = max(3, min(10, num_results))
        results = await search_projects_impl(query, top_k=top_k)

        # A working index always returns its closest projects, so an empty
        # list means the index is empty or misconfigured: an outage too.
        if not results:
            return PROJECT_SEARCH_UNAVAILABLE

        response = f"Found {len(results)} relevant projects:\n\n"
        for i, project in enumerate(results, 1):
            clean_name = clean_markdown(project["name"])
            clean_summary = clean_markdown(project["summary"])
            response += f"{i}. Project ID: {project['id']}\n"
            response += f"   Name: {clean_name}\n"
            response += f"   Summary: {clean_summary}\n\n"
        return response.strip()

    except ProjectSearchUnavailable:
        return PROJECT_SEARCH_UNAVAILABLE
    except Exception:
        logger.exception("search_projects failed for %r", query)
        return PROJECT_SEARCH_UNAVAILABLE
```

### get_project_details

```python
async def get_project_details(project_id: str, message: str) -> str:
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

    except ProjectSearchUnavailable:
        return PROJECT_SEARCH_UNAVAILABLE
    except Exception:
        logger.exception("get_project_details failed for %r", project_id)
        return PROJECT_SEARCH_UNAVAILABLE
```

## When Pinecone Is Down

If the embedding call or Pinecone fails, `project_search.py` raises
`ProjectSearchUnavailable` instead of returning an empty list. Both tools then
return the same fixed string, `PROJECT_SEARCH_UNAVAILABLE` in `agent_tools.py`:

```
Project search is temporarily unavailable. This is an outage, not a result: it
says nothing about which projects are Bill's, so don't tell the user any project
isn't his.
```

Why it can't look like an empty result: `prompts.py` section 11 tells the persona
that a project search didn't return isn't one of Bill's. The tools used to answer
an outage with "No projects found matching that query.", so during a Pinecone
outage the persona told visitors that real projects weren't his. Section 11 now has
a "When project search is down" rule that keys on the words "project search is
temporarily unavailable". `tests/test_agent_tools.py` checks that the tool string
and the prompt still share that phrase, so reword both together.

The raw error goes to the server log, not to the model.

## Markdown Cleaning

All text is cleaned for voice output:

```python
def clean_markdown(text: str) -> str:
    # Remove bold/italic
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    # Remove links
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove headers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    return text
```

## Typical Conversation Flow

```
User: "What AI projects have you built?"

LLM: search_projects(query="AI projects", message="Let me search...")
    → Returns list of 3 projects

LLM: "I've built some cool AI projects. There's Dispatch AI for 
      emergency response, AdaptEd for education... Which sounds 
      interesting?"

User: "Tell me about Dispatch AI"

LLM: get_project_details(project_id="dispatch-ai", message="Let me 
      get the details...")
    → Returns full project info

LLM: display_project(id="dispatch-ai")
    → Navigates to project page

LLM: "So this won the UC Berkeley AI Hackathon grand prize..."
```

## Pinecone Integration

These tools use functions from `project_search.py`:

```python
from project_search import search_projects as search_projects_impl, get_project_by_id
```

See [../../pinecone/docs/search/functions.md](../../pinecone/docs/search/functions.md) for Pinecone details.

## Modifications

### Change Number of Results

```python
results = search_projects_impl(query, top_k=5)  # Return 5 instead of 3
```

### Add Project Filtering

```python
@tool
def search_projects_by_tech(technology: str, message: str) -> str:
    """Search for projects using a specific technology."""
    results = search_projects_impl(f"projects using {technology}", top_k=3)
    # ... format results
```

### Add Similar Projects

```python
@tool
def find_similar_projects(project_id: str, message: str) -> str:
    """Find projects similar to a given project."""
    from project_search import find_similar_projects as find_similar
    results = find_similar(project_id, top_k=3)
    # ... format results
```

## Related Files

- [navigation.md](navigation.md) - Navigation tools (used after search)
- [../modules/llm.md](../modules/llm.md) - LLM client
- `project_search.py` - Pinecone search implementation
- `../../pinecone/docs/` - Pinecone documentation
