import re
from typing import Optional

from sentence_transformers import SentenceTransformer
import chromadb

# ---------------------------------------------------------------------------
# Setup — module-level singletons, loaded once on first import
# ---------------------------------------------------------------------------

EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")

CHROMA_CLIENT = chromadb.PersistentClient(path="./chroma_db")
COLLECTION = CHROMA_CLIENT.get_or_create_collection(
    name="notes",
    metadata={"hnsw:space": "cosine"},
)


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_text(text: str, chunk_words: int = 300, overlap_words: int = 50) -> list[str]:
    """
    Split text into overlapping chunks by word count.
    Each chunk is ~chunk_words words, with overlap_words words of context
    carried over from the previous chunk so meaning isn't cut off at boundaries.
    """
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_words
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        if end >= len(words):
            break
        start += chunk_words - overlap_words
    return chunks


# ---------------------------------------------------------------------------
# Ingestion — accepts pre-extracted text, stores user_id in metadata
# ---------------------------------------------------------------------------

def ingest_files(files: list[dict], user_id: str) -> dict:
    """
    Ingest a list of already-extracted text files into ChromaDB for a specific user.

    Each item in `files` is:
        {
            "filename": str,          # original filename e.g. "arrays.pdf"
            "text": str,              # extracted text content
            "skipped_pages": list[int]  # PDF pages that yielded no text (may be [])
        }

    Chunk IDs are scoped to user_id + filename + chunk_index so:
      - Different users never collide
      - Re-uploading the same file by the same user upserts (no duplicates)

    Metadata stored per chunk:
        user_id, source (filename), concept_id (inferred from stem), chunk_index
    """
    if not files:
        raise ValueError("No files provided for ingestion.")

    total_chunks = 0
    files_processed = []
    all_skipped: dict[str, list[int]] = {}

    for file_item in files:
        filename: str = file_item["filename"]
        text: str = file_item.get("text", "").strip()
        skipped: list[int] = file_item.get("skipped_pages", [])

        if skipped:
            all_skipped[filename] = skipped

        if not text:
            # Nothing extractable — still report skipped pages but skip ingestion
            files_processed.append({"filename": filename, "chunks": 0})
            continue

        # Infer concept_id from filename stem
        stem = re.sub(r"\.[^.]+$", "", filename).lower()  # strip extension
        concept_id = re.sub(r"[-_]?(notes|note|summary|cheatsheet|ref)$", "", stem).strip("-_")

        chunks = chunk_text(text)

        ids = []
        embeddings = []
        documents = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            # Chunk ID is globally unique per user + file + position
            chunk_id = f"{user_id}__{filename}__chunk_{i}"
            embedding = EMBED_MODEL.encode(chunk).tolist()

            ids.append(chunk_id)
            embeddings.append(embedding)
            documents.append(chunk)
            metadatas.append({
                "user_id": user_id,
                "source": filename,
                "concept_id": concept_id,
                "chunk_index": i,
            })

        # Upsert — re-uploading same file for same user overwrites cleanly
        COLLECTION.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )

        total_chunks += len(chunks)
        files_processed.append({"filename": filename, "chunks": len(chunks)})

    return {
        "files_processed": files_processed,
        "total_chunks": total_chunks,
        "collection_total": COLLECTION.count(),
        "skipped_pages": all_skipped,  # {filename: [page_numbers]} for pages with no text
    }


# ---------------------------------------------------------------------------
# Retrieval — always filtered by user_id
# ---------------------------------------------------------------------------

def retrieve_notes(
    query: str,
    user_id: str,
    concept_id: Optional[str] = None,
    k: int = 3,
) -> list[dict]:
    """
    Embed the query and return the top-k most similar chunks from ChromaDB,
    filtered to this user's notes only.

    If concept_id is also provided, filters further to that concept's chunks.
    Returns [] gracefully if the user has no notes — never crashes.
    """
    # Guard: if collection is empty we can't query at all
    total = COLLECTION.count()
    if total == 0:
        return []

    query_embedding = EMBED_MODEL.encode(query).tolist()

    # Build ChromaDB where filter
    if concept_id:
        where = {"$and": [{"user_id": user_id}, {"concept_id": concept_id}]}
    else:
        where = {"user_id": user_id}

    try:
        results = COLLECTION.query(
            query_embeddings=[query_embedding],
            n_results=min(k, total),
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        # ChromaDB raises if where filter matches 0 docs in some versions
        return []

    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]

    if not docs:
        return []

    output = []
    for doc, meta, dist in zip(docs, metas, dists):
        output.append({
            "chunk": doc,
            "source": meta.get("source", ""),
            "concept_id": meta.get("concept_id", ""),
            "chunk_index": meta.get("chunk_index", 0),
            "similarity": round(1 - dist, 4),
        })

    return output


# ---------------------------------------------------------------------------
# has_notes helper — used by GET /users/{user_id}/has-notes
# ---------------------------------------------------------------------------

def user_has_notes(user_id: str) -> bool:
    """Return True if this user has at least one chunk in ChromaDB."""
    total = COLLECTION.count()
    if total == 0:
        return False
    try:
        results = COLLECTION.get(where={"user_id": user_id}, limit=1)
        return len(results.get("ids", [])) > 0
    except Exception:
        return False