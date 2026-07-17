"""Topic-relevance via sentence embeddings (all-MiniLM-L6-v2).

The embedding model is loaded ONCE, lazily, via lru_cache — never per request
and never in AppConfig.ready(). Heavy imports live inside the functions.

The returned value is a RAW cosine similarity in [-1, 1]; it is always stored
so the score mapping (scoring.yaml) can be re-calibrated without re-embedding.
"""

from functools import lru_cache


@lru_cache(maxsize=1)
def get_embedder():
    """Return the shared SentenceTransformer, loading it on first use."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("all-MiniLM-L6-v2", device="cpu")


def similarity(transcript: str, topic_text: str) -> float:
    """Cosine similarity between the transcript and the topic prompt.

    Embeddings are L2-normalized, so the dot product is the cosine. An empty
    transcript embeds as an empty string and yields a low similarity.
    """
    import numpy as np

    model = get_embedder()
    vecs = model.encode([transcript or "", topic_text], normalize_embeddings=True)
    return float(np.dot(vecs[0], vecs[1]))
