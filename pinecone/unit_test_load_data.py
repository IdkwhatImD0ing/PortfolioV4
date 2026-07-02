import asyncio
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# Mock missing modules before importing load_data
mock_pinecone = MagicMock()
sys.modules["pinecone"] = mock_pinecone
mock_openai = MagicMock()
sys.modules["openai"] = mock_openai
mock_dotenv = MagicMock()
sys.modules["dotenv"] = mock_dotenv

import load_data

class TestLoadData(unittest.TestCase):
    def test_prepare_vectors_structure(self):
        # Sample data
        data = [
            {
                "id": "project1",
                "name": "Project One",
                "summary": "Summary 1",
                "details": "Details 1",
                "github": "https://github.com/p1",
                "demo": "https://demo.com/p1"
            },
            {
                "id": "project2",
                "name": "Project Two",
                "summary": "Summary 2",
                "details": "Details 2"
                # missing github and demo
            }
        ]

        # Mock embeddings
        dummy_embeddings = [[0.1] * 3072, [0.2] * 3072]

        with patch('load_data.get_embeddings', new_callable=AsyncMock, return_value=dummy_embeddings) as mock_get_embeddings:
            vectors = asyncio.run(load_data.prepare_vectors(data))

            # Check calls
            mock_get_embeddings.assert_called_once()
            self.assertEqual(len(mock_get_embeddings.call_args[0][0]), 2)

            # Check vectors structure
            self.assertEqual(len(vectors), 2)

            # Vector 1
            id1, emb1, meta1 = vectors[0]
            self.assertEqual(id1, "project1")
            self.assertEqual(emb1, dummy_embeddings[0])
            self.assertEqual(meta1["name"], "Project One")
            self.assertEqual(meta1["github"], "https://github.com/p1")
            self.assertEqual(meta1["demo"], "https://demo.com/p1")

            # Vector 2
            id2, emb2, meta2 = vectors[1]
            self.assertEqual(id2, "project2")
            self.assertEqual(emb2, dummy_embeddings[1])
            self.assertEqual(meta2["name"], "Project Two")
            self.assertNotIn("github", meta2)
            self.assertNotIn("demo", meta2)

    def test_get_embedding_singular(self):
        # get_embedding should call get_embeddings with a single-item list
        dummy_embedding = [0.1] * 3072

        with patch('load_data.get_embeddings', new_callable=AsyncMock, return_value=[dummy_embedding]) as mock_get_embeddings:
            result = asyncio.run(load_data.get_embedding("test text"))

            mock_get_embeddings.assert_called_once_with(["test text"])
            self.assertEqual(result, dummy_embedding)

if __name__ == "__main__":
    unittest.main()
