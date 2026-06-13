import asyncio
import json
import os
from typing import Dict, List

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pinecone import Pinecone

load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

pc = Pinecone(api_key=PINECONE_API_KEY)
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

INDEX_NAME = "portfolio"
EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 3072


def build_embedding_text(item: Dict) -> str:
    """Build the text blob that gets embedded for a single project item."""
    return f"""
        Project: {item["name"]}

        Summary:
        {item["summary"]}

        Details:
        {item["details"]}
        """


async def get_embedding(text: str) -> List[float]:
    """Generate embedding for text using OpenAI's text-embedding-3-large model."""
    return (await get_embeddings([text]))[0]


async def get_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for a list of texts in a single batch call."""
    if not texts:
        return []

    response = await openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [d.embedding for d in response.data]


async def prepare_vectors(data: List[Dict]) -> List[tuple]:
    """Prepare vectors for Pinecone upsert."""
    texts_to_embed = []
    for item in data:
        text_content = build_embedding_text(item)
        texts_to_embed.append(text_content)

    print(f"Generating embeddings for {len(texts_to_embed)} items in batch...")
    all_embeddings = await get_embeddings(texts_to_embed)

    vectors = []
    for i, item in enumerate(data):
        project_id = item["id"]
        embedding = all_embeddings[i]

        metadata = {
            "id": project_id,
            "name": item["name"],
            "summary": item["summary"],
            "details": item["details"],
        }

        if item.get("github"):
            metadata["github"] = item["github"]
        if item.get("demo"):
            metadata["demo"] = item["demo"]

        vectors.append((project_id, embedding, metadata))

    return vectors


async def main():
    print("Loading data...")
    with open("data.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Found {len(data)} projects to load")

    print("Connecting to Pinecone index...")
    index = pc.Index(INDEX_NAME)

    index_stats = await asyncio.to_thread(index.describe_index_stats)
    print(f"Index stats before upload: {index_stats}")

    print("Generating embeddings...")
    vectors = await prepare_vectors(data)

    print(f"Uploading {len(vectors)} vectors to Pinecone...")
    await asyncio.to_thread(index.upsert, vectors=vectors)

    index_stats = await asyncio.to_thread(index.describe_index_stats)
    print(f"Index stats after upload: {index_stats}")

    print("\nTesting retrieval with a sample query...")
    test_query = "interview preparation AI coaching"
    query_embedding = await get_embedding(test_query)

    results = await asyncio.to_thread(
        index.query,
        vector=query_embedding,
        top_k=3,
        include_metadata=True,
    )

    print(f"\nTop 3 results for query '{test_query}':")
    for i, match in enumerate(results.matches, 1):
        print(f"\n{i}. {match.metadata['name']} (Score: {match.score:.3f})")
        print(f"   ID: {match.id}")
        print(f"   Summary preview: {match.metadata['summary'][:200]}...")


if __name__ == "__main__":
    asyncio.run(main())
