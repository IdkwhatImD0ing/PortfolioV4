# Navigation Tools

Documentation for the page navigation tools used by the LLM.

## File Location

`llm.py` (navigation tool definitions)

## Purpose

Allow the LLM to navigate the frontend to different pages during conversation. Each tool triggers a `MetadataResponse`, which reaches the frontend as a Pusher `navigation` event on voice calls and a `metadata` chunk in text chat.

## Available Tools

### display_landing_page

Navigate to the initial landing page.

```python
@tool
def display_landing_page() -> str:
    """Displays the landing page on the frontend."""
    return "Successfully displayed the landing page"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "landing"}
```

### display_homepage

Navigate to the personal/about page.

```python
@tool
def display_homepage() -> str:
    """Displays Bill's personal homepage on the frontend."""
    return "Successfully displayed the personal homepage"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "personal"}
```

### display_resume_page

Navigate to the resume page.

```python
@tool
def display_resume_page() -> str:
    """Displays Bill's resume page on the frontend."""
    return "Successfully displayed the resume page"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "resume"}
```

### display_education_page

Navigate to the education page.

```python
@tool
def display_education_page() -> str:
    """Displays the education page on the frontend."""
    return "Successfully displayed the education page"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "education"}
```

### display_hackathons_page

Navigate to the hackathon journey page.

```python
@tool
def display_hackathons_page() -> str:
    """Displays the hackathons map page on the frontend, showing Bill's hackathon journey across the US."""
    return "Successfully displayed the hackathons page"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "hackathon"}
```

**Trigger phrases:** "show me your hackathons", "hackathon journey", "hackathon map", "where have you competed", "hackathon wins"

### display_architecture_page

Navigate to the "How It Works" architecture page (Easter egg).

```python
@tool
def display_architecture_page() -> str:
    """Displays the architecture / 'how it works' page on the frontend."""
    return "Successfully displayed the architecture page"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "architecture"}
```

**Trigger phrases:** "how does this work", "what's under the hood", "show me the tech stack", "how was this built"

### display_project

Navigate to a specific project page.

```python
@tool
def display_project(id: str) -> str:
    """Displays a specific project on the frontend.
    
    Args:
        id: The unique project ID (e.g., "dispatch-ai")
    """
    return f"Successfully displayed project: {id}"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "project", "project_id": "dispatch-ai"}
```

## Spoken Messages

Navigation tools do not accept a `message` parameter and do not emit spoken `ResponseResponse` chunks. If the assistant should narrate a page transition, that narration belongs in the normal model response text.

## Navigation Event Flow

```
1. LLM calls tool (e.g., display_education_page)
2. Server yields ToolCallInvocationResponse
3. Server yields MetadataResponse
4. main.py sends it to Retell, and publishes it as a `navigation` event on the
   call's Pusher channel (voice_events.py). Retell's v3 web calls don't forward
   metadata to the browser, so the Pusher event is the one that arrives.
5. Server yields ToolCallResultResponse
6. Frontend's channel handler calls applyNavigation() and the page scrolls
```

## Adding a New Navigation Tool

### 1. Define the Tool

```python
@tool
def display_skills_page() -> str:
    """Displays the skills page on the frontend."""
    return "Successfully displayed the skills page"
```

### 2. Add to prepare_functions()

```python
def prepare_functions(self) -> List[Any]:
    return [
        display_education_page,
        display_homepage,
        display_landing_page,
        display_resume_page,
        display_hackathons_page,
        display_architecture_page,
        display_project,
        search_projects,
        get_project_details,
        display_skills_page,  # Add here
    ]
```

### 3. Handle Metadata in draft_response()

```python
elif name == "display_skills_page":
    yield MetadataResponse(
        metadata={"type": "navigation", "page": "skills"}
    )
```

### 4. Update Frontend

In `client/src/app/page.tsx`:

```typescript
case "skills":
    setActivePage("skills");
    break;
```

### 5. Update System Prompt

In `prompts.py`, add to navigation section:

```
- **display_skills_page()**: Shows the skills page
```

## Related Files

- [../modules/llm.md](../modules/llm.md) - LLM client handling tool calls
- [search.md](search.md) - Project search tools
- `../../client/docs/components/page.md` - Frontend handling metadata
