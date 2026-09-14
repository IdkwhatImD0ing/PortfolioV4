# Search Functions

Documentation for the Pinecone search functions used at runtime.

## File Location

`server/project_search.py`

## Purpose

Provides semantic search over project vectors in Pinecone. Called by LLM tools during voice conversations.

## Configuration

```python
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

pc = Pinecone(api_key=PINECONE_API_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)

INDEX_NAME = "portfolio"
EMBEDDING_MODEL = "text-embedding-3-large"
```

## Functions

### get_embedding()

Generate embedding for query text.

```python
def get_embedding(text: str) -> List[float]:
    """Generate embedding using OpenAI's text-embedding-3-large model."""
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text
    )
    return response.data[0].embedding
```

### search_projects()

Semantic search for projects.

```python
def search_projects(query: str, top_k: int = 3) -> List[Dict]:
    """
    Search for Bill Zhang's projects using semantic search.
    
    Args:
        query: The search query describing what to find
        top_k: Number of results to return (default: 3)
    
    Returns:
        List of project dictionaries with metadata and scores
    """
```

**Parameters:**
- `query`: Natural language description (e.g., "AI projects", "hackathon winners")
- `top_k`: Maximum results to return

**Returns:**
```python
[
    {
        "id": "dispatch-ai",
        "name": "Dispatch AI",
        "summary": "AI-powered emergency call handling...",
        "details": "Full description...",
        "score": 0.892,
        "github": "https://github.com/...",  # Optional
        "demo": "https://youtu.be/..."        # Optional
    },
    # ... more results
]
```

**Implementation:**
```python
def search_projects(query: str, top_k: int = 3) -> List[Dict]:
    query_embedding = get_embedding(query)
    
    index = pc.Index(INDEX_NAME)
    
    results = index.query(
        vector=query_embedding,
        top_k=top_k,
        include_metadata=True
    )
    
    projects = []
    for match in results.matches:
        project = {
            "id": match.id,
            "name": match.metadata.get("name", "Unknown Project"),
            "summary": match.metadata.get("summary", "No summary"),
            "details": match.metadata.get("details", "No details"),
            "score": round(match.score, 3)
        }
        
        if match.metadata.get("github"):
            project["github"] = match.metadata["github"]
        if match.metadata.get("demo"):
            project["demo"] = match.metadata["demo"]
        
        projects.append(project)
    
    return projects
```

### get_project_by_id()

Fetch a specific project by its exact ID. The LLM should always use
`search_projects` first to resolve a project name to its ID before calling this.

```python
def get_project_by_id(project_id: str) -> Optional[Dict]:
    """
    Fetch a specific project by its ID.
    
    Args:
        project_id: The unique ID of the project
    
    Returns:
        Project dictionary or None if not found
    """
```

**Implementation:**
```python
def get_project_by_id(project_id: str) -> Optional[Dict]:
    index = pc.Index(INDEX_NAME)
    
    fetch_result = index.fetch(ids=[project_id])
    
    if project_id in fetch_result.vectors:
        metadata = fetch_result.vectors[project_id].metadata
        
        project = {
            "id": project_id,
            "name": metadata.get("name", "Unknown"),
            "summary": metadata.get("summary", "No summary"),
            "details": metadata.get("details", "No details")
        }
        
        if metadata.get("github"):
            project["github"] = metadata["github"]
        if metadata.get("demo"):
            project["demo"] = metadata["demo"]
        
        return project
    
    return None
```

### find_similar_projects()

Find projects similar to a given project.

```python
def find_similar_projects(project_id: str, top_k: int = 3) -> List[Dict]:
    """
    Find projects similar to a given project.
    
    Args:
        project_id: The ID of the reference project
        top_k: Number of similar projects to return
    
    Returns:
        List of similar project dictionaries
    """
```

**Implementation:**
```python
def find_similar_projects(project_id: str, top_k: int = 3) -> List[Dict]:
    index = pc.Index(INDEX_NAME)
    
    # Get the project's vector
    fetch_result = index.fetch(ids=[project_id])
    
    if project_id not in fetch_result.vectors:
        return []
    
    vector = fetch_result.vectors[project_id]
    
    # Query for similar (excluding original)
    results = index.query(
        vector=vector.values,
        top_k=top_k + 1,
        include_metadata=True
    )
    
    similar = []
    for match in results.matches:
        if match.id != project_id:
            similar.append({
                "id": match.id,
                "name": match.metadata.get("name"),
                "summary": match.metadata.get("summary"),
                "score": round(match.score, 3)
            })
    
    return similar[:top_k]
```

## Usage Examples

### In LLM Tools

```python
from project_search import search_projects, get_project_by_id

# Search for AI projects
results = search_projects("AI machine learning", top_k=3)
for p in results:
    print(f"{p['name']}: {p['score']}")

# Get specific project
project = get_project_by_id("dispatch-ai")
if project:
    print(project['details'])
```

### Direct Testing

```python
# Test search
results = search_projects("hackathon winners")
print(f"Found {len(results)} projects")

# Test fetch
project = get_project_by_id("dispatch-ai")
print(project['name'] if project else "Not found")

# Test similar
similar = find_similar_projects("dispatch-ai")
for p in similar:
    print(f"Similar: {p['name']}")
```

## Error Handling

`search_projects`, `get_project_by_id`, and `find_similar_projects` log a failure
and raise `ProjectSearchUnavailable`:

```python
except Exception as e:
    print(f"Error searching projects: {e}")
    raise ProjectSearchUnavailable(str(e)) from e
```

They don't return `[]` or `None` on failure, because an empty result reads as
"Bill has no such project". When they returned `[]`, a Pinecone outage made the
persona tell visitors that real projects weren't his. `[]` and `None` now only
mean the index answered and had nothing. The agent tools turn the exception into
a "project search is temporarily unavailable" message; see
`../../server/docs/tools/search.md`.

## Modifications

### Change Default Results

```python
def search_projects(query: str, top_k: int = 5) -> List[Dict]:  # 5 instead of 3
```

### Add Filtering

```python
results = index.query(
    vector=query_embedding,
    top_k=top_k,
    include_metadata=True,
    filter={"tags": {"$in": ["AI", "ML"]}}  # Filter by tags
)
```

### Add Score Threshold

```python
projects = []
for match in results.matches:
    if match.score >= 0.7:  # Only high-confidence matches
        projects.append(...)
```

## Related Files

- [../data/pipeline.md](../data/pipeline.md) - Data upload
- `../../server/docs/tools/search.md` - LLM tool wrappers
- [testing.md](testing.md) - Testing guide
