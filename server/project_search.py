import os
from typing import Dict, List, Optional

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pinecone import PineconeAsyncio

from firetrace import step

load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

pc = PineconeAsyncio(api_key=PINECONE_API_KEY)
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

INDEX_NAME = "portfolio"
EMBEDDING_MODEL = "text-embedding-3-large"

DEFAULT_PROJECT_NAME = "Unknown Project"
DEFAULT_PROJECT_SUMMARY = "No summary available"
DEFAULT_PROJECT_DETAILS = "No details available"

# IndexAsyncio takes a host, not an index name, so resolve the host once (via the
# control plane) and cache it for the process lifetime.
_index_host: Optional[str] = None


class ProjectSearchUnavailable(Exception):
    """The embedding call or the Pinecone index failed.

    Raised instead of returning an empty result. An empty search reads as "Bill
    has no such project", and the persona would then disown a real one.
    """


async def _resolve_index_host() -> str:
    """Resolve and cache the Pinecone index host for INDEX_NAME."""
    global _index_host
    if _index_host is None:
        async with PineconeAsyncio(api_key=PINECONE_API_KEY) as client:
            desc = await client.describe_index(name=INDEX_NAME)
            _index_host = desc.host
    return _index_host


def _attach_links(project: Dict, metadata) -> None:
    """Attach optional github/demo links from metadata onto a project dict, if present."""
    if metadata.get("github"):
        project["github"] = metadata.get("github")
    if metadata.get("demo"):
        project["demo"] = metadata.get("demo")


def _token_count(value) -> Optional[int]:
    """An int token count, or None for anything else (mocks, missing usage)."""
    return value if isinstance(value, int) and not isinstance(value, bool) else None


async def get_embedding(text: str) -> List[float]:
    """Generate embedding for text using OpenAI's text-embedding-3-large model."""
    # Recorded as an `embedding` span under the calling tool's span when a
    # traced run is in flight; a no-op otherwise (debug CLI, tests).
    with step(
        "embed-query",
        kind="embedding",
        provider="openai",
        model=EMBEDDING_MODEL,
        input=text,
    ) as span:
        response = await openai_client.embeddings.create(model=EMBEDDING_MODEL, input=text)
        embedding = response.data[0].embedding
        usage = getattr(response, "usage", None)
        tokens = {
            "inputTokens": _token_count(getattr(usage, "prompt_tokens", None)),
            "totalTokens": _token_count(getattr(usage, "total_tokens", None)),
        }
        span["usage"] = {k: v for k, v in tokens.items() if v is not None}
        span["output"] = {"dimensions": len(embedding)}
        return embedding


async def search_projects(query: str, top_k: int = 3) -> List[Dict]:
    """
    Search for Bill Zhang's projects using semantic search.

    Args:
        query: The search query describing what kind of projects to find
        top_k: Number of top results to return (default: 3)

    Returns:
        List of project dictionaries with metadata and relevance scores

    Raises:
        ProjectSearchUnavailable: the embedding call or the Pinecone query failed
    """
    try:
        query_embedding = await get_embedding(query)

        host = await _resolve_index_host()
        with step(
            "pinecone.query",
            kind="retriever",
            provider="pinecone",
            index=INDEX_NAME,
            top_k=top_k,
            input=query,
        ) as span:
            async with pc.IndexAsyncio(host=host) as index:
                results = await index.query(
                    vector=query_embedding,
                    top_k=top_k,
                    include_metadata=True,
                )

            projects = []
            for match in results.matches:
                project = {
                    "id": match.id,
                    "name": match.metadata.get("name", DEFAULT_PROJECT_NAME),
                    "summary": match.metadata.get("summary", DEFAULT_PROJECT_SUMMARY),
                    "details": match.metadata.get("details", DEFAULT_PROJECT_DETAILS),
                    "score": round(match.score, 3),
                }

                _attach_links(project, match.metadata)

                projects.append(project)

            span["output"] = [
                {"id": p["id"], "name": p["name"], "score": p["score"]} for p in projects
            ]

        return projects

    except Exception as e:
        print(f"Error searching projects: {e}")
        raise ProjectSearchUnavailable(str(e)) from e


async def get_project_by_id(project_id: str) -> Optional[Dict]:
    """
    Fetch a specific project by its ID.

    Args:
        project_id: The unique ID of the project

    Returns:
        Project dictionary with metadata or None if not found

    Raises:
        ProjectSearchUnavailable: the Pinecone fetch failed
    """
    try:
        host = await _resolve_index_host()
        with step(
            "pinecone.fetch",
            kind="retriever",
            provider="pinecone",
            index=INDEX_NAME,
            input={"id": project_id},
        ) as span:
            async with pc.IndexAsyncio(host=host) as index:
                fetch_result = await index.fetch(ids=[project_id])

            if project_id in fetch_result.vectors:
                vector_data = fetch_result.vectors[project_id]
                metadata = vector_data.metadata

                project = {
                    "id": project_id,
                    "name": metadata.get("name", DEFAULT_PROJECT_NAME),
                    "summary": metadata.get("summary", DEFAULT_PROJECT_SUMMARY),
                    "details": metadata.get("details", DEFAULT_PROJECT_DETAILS),
                }

                _attach_links(project, metadata)

                span["output"] = {"found": True, "id": project_id, "name": project["name"]}
                return project

            span["output"] = {"found": False, "id": project_id}
            return None

    except Exception as e:
        print(f"Error fetching project {project_id}: {e}")
        raise ProjectSearchUnavailable(str(e)) from e


async def find_similar_projects(project_id: str, top_k: int = 3) -> List[Dict]:
    """
    Find projects similar to a given project.

    Args:
        project_id: The ID of the project to find similar ones to
        top_k: Number of similar projects to return

    Returns:
        List of similar project dictionaries

    Raises:
        ProjectSearchUnavailable: the Pinecone fetch or query failed
    """
    try:
        host = await _resolve_index_host()
        async with pc.IndexAsyncio(host=host) as index:
            fetch_result = await index.fetch(ids=[project_id])

            if project_id not in fetch_result.vectors:
                return []

            vector = fetch_result.vectors[project_id]

            results = await index.query(
                vector=vector.values,
                top_k=top_k + 1,
                include_metadata=True,
            )

        similar_projects = []
        for match in results.matches:
            if match.id != project_id:
                project = {
                    "id": match.id,
                    "name": match.metadata.get("name", DEFAULT_PROJECT_NAME),
                    "summary": match.metadata.get("summary", DEFAULT_PROJECT_SUMMARY),
                    "score": round(match.score, 3),
                }
                similar_projects.append(project)

        return similar_projects[:top_k]

    except Exception as e:
        print(f"Error finding similar projects: {e}")
        raise ProjectSearchUnavailable(str(e)) from e
