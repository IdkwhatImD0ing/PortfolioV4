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

Navigate to the About section, the at-a-glance overview ("tell me about yourself"). The name is from the old site, where this was the homepage.

```python
@tool
def display_homepage() -> str:
    """Displays the About section on the frontend: who Bill is, at a glance."""
    return "Successfully displayed the about section"
```

**Metadata sent:**
```json
{"type": "navigation", "page": "about"}
```

### display_experience_page, display_skills_page, display_personal_page, display_projects_page

| Tool | Page sent | Section | Asked when |
|---|---|---|---|
| `display_experience_page` | `experience` | Experience | where Bill works, his job, work history |
| `display_skills_page` | `skills` | Skills | languages, tech stack, skills |
| `display_personal_page` | `personal` | Personal | hobbies, life outside work |
| `display_projects_page` | `project` (no `project_id`) | Projects grid | what he's built, listing projects |

`scripts/nav_audit.py` checks that ordinary questions land on these sections.

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

Text chat skips Pusher: `/chat` streams the same payload as a `metadata` chunk.

## Adding a New Navigation Tool

Say the page gets a Contact section with `id="contact"`.

1. **Define the tool** in `agent_tools.py` and add it to `__all__`:

   ```python
   @tool
   def display_contact_page() -> str:
       """Displays the contact section on the frontend."""
       return "Successfully displayed the contact section"
   ```

2. **Register it** in `llm.py`: the import, `__all__`, and `prepare_functions()`.

3. **Map it to a page value** in `navigation.py` `_PAGE_TOOLS`:
   `"display_contact_page": "contact"`. `main.py` and the text path both go
   through `tool_call_to_metadata`, so nothing else on the server changes.

4. **Map the page to the section** in `client/src/lib/voice-bus.ts`: add
   `"contact"` to `NavigationMeta.page` and `contact: "contact"` to
   `PAGE_TO_SECTION`.

5. **Tell the agent when to use it** in `prompts.py` section 9, with WHEN TO USE
   and WHEN NOT TO USE lines like the other tools.

6. **Update the tests** that pin the contract (`tests/test_navigation.py`,
   `tests/test_llm.py`, `client/src/lib/voice-bus.test.ts`), and add a question
   or two to `scripts/nav_audit.py` so the audit checks the agent really uses it.

## Related Files

- [../modules/llm.md](../modules/llm.md) - LLM client handling tool calls
- [search.md](search.md) - Project search tools
- `../../client/docs/components/page.md` - Frontend handling metadata
