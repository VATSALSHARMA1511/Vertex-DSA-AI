import io
import json
from dotenv import load_dotenv
load_dotenv()

from llm_agents import explain_mistake, generate_revision_plan, grade_attempt
from rag import ingest_files, retrieve_notes, user_has_notes
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Field, Session, SQLModel, create_engine, select, JSON, Column

from bkt import DEFAULT_PARAMS, update_mastery, apply_decay

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Concept(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    prerequisite_ids: list = Field(default=[], sa_column=Column(JSON))


class Question(SQLModel, table=True):
    id: str = Field(primary_key=True)
    concept_id: str = Field(foreign_key="concept.id")
    text: str
    difficulty: int
    expected_approach: str


class Attempt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str
    question_id: str = Field(foreign_key="question.id")
    concept_id: str = Field(foreign_key="concept.id")
    correct: bool
    time_taken_seconds: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Mastery(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str
    concept_id: str = Field(foreign_key="concept.id")
    p_mastery: float = 0.0
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# DB setup
# ---------------------------------------------------------------------------

DATABASE_URL = "sqlite:///./app.db"
engine = create_engine(DATABASE_URL, echo=False)


def seed_db():
    with Session(engine) as session:
        if not session.exec(select(Concept)).first():
            data = json.loads(Path("concepts.json").read_text())
            for item in data:
                session.add(Concept(**item))
            session.commit()
            print(f"Seeded {len(data)} concepts.")

        if not session.exec(select(Question)).first():
            data = json.loads(Path("questions.json").read_text())
            for item in data:
                session.add(Question(**item))
            session.commit()
            print(f"Seeded {len(data)} questions.")


# ---------------------------------------------------------------------------
# Shared helper: compute effective mastery for all concepts for a user
# ---------------------------------------------------------------------------

def get_effective_mastery_map(user_id: str, session: Session) -> dict[str, float]:
    rows = session.exec(
        select(Mastery).where(Mastery.user_id == user_id)
    ).all()

    mastery_by_concept = {}
    now = datetime.now(timezone.utc)

    for row in rows:
        last = row.last_updated
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        days = (now - last).total_seconds() / 86400
        mastery_by_concept[row.concept_id] = apply_decay(row.p_mastery, days)

    all_concepts = session.exec(select(Concept)).all()
    for concept in all_concepts:
        if concept.id not in mastery_by_concept:
            mastery_by_concept[concept.id] = DEFAULT_PARAMS["p_init"]

    return mastery_by_concept


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Vertex DSA Tutor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)
    seed_db()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/concepts")
def get_concepts():
    with Session(engine) as session:
        return session.exec(select(Concept)).all()


@app.get("/questions/{concept_id}")
def get_questions(concept_id: str):
    with Session(engine) as session:
        questions = session.exec(
            select(Question).where(Question.concept_id == concept_id)
        ).all()
        if not questions:
            raise HTTPException(status_code=404, detail="No questions found for concept")
        return questions


class AttemptIn(BaseModel):
    user_id: str
    question_id: str
    time_taken_seconds: int
    user_approach: str = ""


@app.post("/attempts", status_code=201)
def post_attempt(body: AttemptIn):
    with Session(engine) as session:
        question = session.get(Question, body.question_id)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        grading = grade_attempt(
            question_text=question.text,
            expected_approach=question.expected_approach,
            user_approach=body.user_approach,
        )
        correct = grading["correct"]

        attempt = Attempt(
            user_id=body.user_id,
            question_id=body.question_id,
            concept_id=question.concept_id,
            correct=correct,
            time_taken_seconds=body.time_taken_seconds,
        )
        session.add(attempt)

        mastery_row = session.exec(
            select(Mastery).where(
                Mastery.user_id == body.user_id,
                Mastery.concept_id == question.concept_id,
            )
        ).first()

        prior = mastery_row.p_mastery if mastery_row else DEFAULT_PARAMS["p_init"]
        new_p = update_mastery(prior, correct, DEFAULT_PARAMS)

        if mastery_row:
            mastery_row.p_mastery = new_p
            mastery_row.last_updated = datetime.now(timezone.utc)
            session.add(mastery_row)
        else:
            session.add(Mastery(
                user_id=body.user_id,
                concept_id=question.concept_id,
                p_mastery=new_p,
                last_updated=datetime.now(timezone.utc),
            ))

        session.commit()
        session.refresh(attempt)

        response = {
            "attempt": attempt,
            "new_p_mastery": round(new_p, 4),
            "correct": correct,
            "feedback": grading["feedback"],
        }

        if not correct:
            response["explanation"] = explain_mistake(
                question_text=question.text,
                concept_id=question.concept_id,
                user_id=body.user_id,
            )

        return response


@app.get("/mastery/{user_id}")
def get_mastery(user_id: str):
    with Session(engine) as session:
        mastery_map = get_effective_mastery_map(user_id, session)
        all_concepts = session.exec(select(Concept)).all()
        concept_names = {c.id: c.name for c in all_concepts}

        rows = session.exec(
            select(Mastery).where(Mastery.user_id == user_id)
        ).all()
        p_mastery_map = {r.concept_id: r.p_mastery for r in rows}

        result = []
        for concept_id, effective in mastery_map.items():
            result.append({
                "concept_id": concept_id,
                "concept_name": concept_names.get(concept_id, concept_id),
                "p_mastery": round(p_mastery_map.get(concept_id, DEFAULT_PARAMS["p_init"]), 4),
                "effective_mastery": round(effective, 4),
            })

        return result


@app.get("/next-question/{user_id}")
def next_question(user_id: str):
    with Session(engine) as session:
        all_concepts = session.exec(select(Concept)).all()
        mastery_map = get_effective_mastery_map(user_id, session)

        PREREQ_THRESHOLD = 0.4
        eligible = []
        for concept in all_concepts:
            prereqs = concept.prerequisite_ids or []
            if all(mastery_map.get(p, DEFAULT_PARAMS["p_init"]) >= PREREQ_THRESHOLD for p in prereqs):
                eligible.append(concept)

        if not eligible:
            raise HTTPException(status_code=404, detail="No eligible concepts found")

        target_concept = min(eligible, key=lambda c: mastery_map[c.id])
        target_mastery = mastery_map[target_concept.id]

        questions = session.exec(
            select(Question).where(Question.concept_id == target_concept.id)
        ).all()

        if not questions:
            raise HTTPException(status_code=404, detail=f"No questions for concept {target_concept.id}")

        past_attempts = session.exec(
            select(Attempt).where(
                Attempt.user_id == user_id,
                Attempt.concept_id == target_concept.id,
            )
        ).all()

        attempted_ids = {a.question_id for a in past_attempts}
        unattempted = [q for q in questions if q.id not in attempted_ids]

        if unattempted:
            chosen = unattempted[0]
        else:
            last_attempt_time: dict[str, datetime] = {}
            for a in past_attempts:
                t = a.created_at
                if t.tzinfo is None:
                    t = t.replace(tzinfo=timezone.utc)
                if a.question_id not in last_attempt_time or t > last_attempt_time[a.question_id]:
                    last_attempt_time[a.question_id] = t

            chosen = min(
                questions,
                key=lambda q: last_attempt_time.get(
                    q.id, datetime.min.replace(tzinfo=timezone.utc)
                ),
            )

        reason = (
            f"Selected because your mastery of '{target_concept.name}' "
            f"({round(target_mastery, 2)}) is your lowest unlocked concept"
        )

        return {
            "question": chosen,
            "concept_id": target_concept.id,
            "concept_name": target_concept.name,
            "effective_mastery": round(target_mastery, 4),
            "reason": reason,
        }


# ---------------------------------------------------------------------------
# Notes ingestion — multipart file upload, per-user
# ---------------------------------------------------------------------------

# File types that are explicitly rejected with a clear error
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".tiff"}

ALLOWED_EXTENSIONS = {".pdf", ".md", ".txt", ".docx"}


def _extract_text_from_upload(filename: str, content: bytes) -> dict:
    """
    Extract text from an uploaded file based on its extension.
    Returns {"filename": str, "text": str, "skipped_pages": list[int]}
    Raises ValueError for unsupported/image types.
    """
    suffix = Path(filename).suffix.lower()

    if suffix in IMAGE_EXTENSIONS:
        raise ValueError(
            f"'{filename}' is an image file. Only .pdf, .md, .txt, and .docx are supported. "
            "Image files cannot be read as text."
        )

    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"'{filename}' has unsupported type '{suffix}'. "
            f"Supported types: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    skipped_pages: list[int] = []

    if suffix == ".pdf":
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    text_parts.append(page_text)
                else:
                    skipped_pages.append(page_num)
        text = "\n\n".join(text_parts)

    elif suffix == ".docx":
        import docx
        doc = docx.Document(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    else:  # .md or .txt
        text = content.decode("utf-8", errors="ignore")

    return {"filename": filename, "text": text, "skipped_pages": skipped_pages}


@app.post("/ingest-notes")
async def ingest_notes(
    user_id: str = Form(...),
    files: list[UploadFile] = File(...),
):
    """
    Accept one or more file uploads for a specific user.
    Supported: .pdf, .md, .txt, .docx
    Rejected: image files (.jpg, .png, etc.)

    PDFs: extracts text page-by-page; reports which pages yielded no text (scanned).
    DOCX: extracts paragraph text.
    MD/TXT: reads directly.

    Chunks are stored in ChromaDB with user_id metadata so each user's
    notes are completely isolated.
    """
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required.")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    extracted: list[dict] = []
    errors: list[str] = []

    for upload in files:
        try:
            content = await upload.read()
            file_data = _extract_text_from_upload(upload.filename, content)
            extracted.append(file_data)
        except ValueError as e:
            errors.append(str(e))
        except Exception as e:
            errors.append(f"Failed to read '{upload.filename}': {str(e)}")

    if not extracted and errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "All files failed to process.", "errors": errors},
        )

    try:
        result = ingest_files(extracted, user_id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        **result,
        "errors": errors,  # partial failures reported but not fatal
    }


@app.get("/users/{user_id}/has-notes")
def has_notes(user_id: str):
    """Returns whether this user has any notes ingested into ChromaDB."""
    return {"has_notes": user_has_notes(user_id)}


@app.get("/test-retrieve")
def test_retrieve(
    q: str,
    user_id: str,
    concept_id: Optional[str] = None,
    k: int = 3,
):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query 'q' cannot be empty")
    results = retrieve_notes(q, user_id=user_id, concept_id=concept_id, k=k)
    return results



@app.get("/stats/{user_id}")
def get_stats(user_id: str):
    from collections import defaultdict
    with Session(engine) as session:
        attempts = session.exec(
            select(Attempt)
            .where(Attempt.user_id == user_id)
            .order_by(Attempt.created_at)
        ).all()
        all_concepts = session.exec(select(Concept)).all()
        concept_names = {c.id: c.name for c in all_concepts}
        if not attempts:
            return {
                "summary": {"total": 0, "correct": 0, "accuracy": 0,
                            "avg_time_seconds": 0, "streak": 0, "concepts_attempted": 0},
                "daily": [], "by_concept": [], "speed_trend": [],
            }
        total = len(attempts)
        correct_count = sum(1 for a in attempts if a.correct)
        accuracy = round(correct_count / total * 100, 1)
        avg_time = round(sum(a.time_taken_seconds for a in attempts) / total)
        streak = 0
        for a in reversed(attempts):
            if a.correct:
                streak += 1
            else:
                break
        concepts_attempted = len({a.concept_id for a in attempts})
        now = datetime.now(timezone.utc)
        daily_correct = defaultdict(int)
        daily_total = defaultdict(int)
        for a in attempts:
            t = a.created_at
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            if (now - t).days < 14:
                day_str = t.strftime("%b %d")
                daily_total[day_str] += 1
                if a.correct:
                    daily_correct[day_str] += 1
        daily = [
            {"day": day,
             "accuracy": round(daily_correct[day] / daily_total[day] * 100, 1),
             "attempts": daily_total[day]}
            for day in sorted(daily_total.keys())
        ]
        concept_correct = defaultdict(int)
        concept_total = defaultdict(int)
        concept_time = defaultdict(list)
        for a in attempts:
            concept_correct[a.concept_id] += int(a.correct)
            concept_total[a.concept_id] += 1
            concept_time[a.concept_id].append(a.time_taken_seconds)
        by_concept = sorted([
            {"concept_id": cid,
             "concept_name": concept_names.get(cid, cid),
             "attempts": concept_total[cid],
             "accuracy": round(concept_correct[cid] / concept_total[cid] * 100, 1),
             "avg_time_seconds": round(sum(concept_time[cid]) / len(concept_time[cid]))}
            for cid in concept_total
        ], key=lambda x: x["accuracy"])
        speed_trend = [
            {"index": i + 1, "time_seconds": a.time_taken_seconds,
             "correct": a.correct,
             "concept": concept_names.get(a.concept_id, a.concept_id)}
            for i, a in enumerate(attempts[-20:])
        ]
        return {
            "summary": {"total": total, "correct": correct_count, "accuracy": accuracy,
                        "avg_time_seconds": avg_time, "streak": streak,
                        "concepts_attempted": concepts_attempted},
            "daily": daily,
            "by_concept": by_concept,
            "speed_trend": speed_trend,
        }


@app.get("/heatmap/{user_id}")
def get_heatmap(user_id: str):
    """
    Returns daily attempt counts for the last 365 days.
    Each entry: {date: "YYYY-MM-DD", count: int, correct: int}
    Used to render the GitHub-style contribution heatmap.
    """
    from collections import defaultdict
    with Session(engine) as session:
        attempts = session.exec(
            select(Attempt).where(Attempt.user_id == user_id)
        ).all()

    now = datetime.now(timezone.utc)
    daily_total:   dict = defaultdict(int)
    daily_correct: dict = defaultdict(int)

    for a in attempts:
        t = a.created_at
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        if (now - t).days < 365:
            day_str = t.strftime("%Y-%m-%d")
            daily_total[day_str]   += 1
            if a.correct:
                daily_correct[day_str] += 1

    # Build full 365-day grid (missing days = 0)
    result = []
    for i in range(364, -1, -1):
        from datetime import timedelta
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        result.append({
            "date":    day,
            "count":   daily_total.get(day, 0),
            "correct": daily_correct.get(day, 0),
        })

    return result


@app.get("/mock-interview/questions/{user_id}")
def mock_interview_questions(user_id: str, count: int = 5):
    """
    Returns `count` questions for a mock interview session.
    Selects across different concepts, spread across difficulties 1-4,
    biased toward the user's weakest concepts.
    """
    import random
    with Session(engine) as session:
        all_concepts = session.exec(select(Concept)).all()
        mastery_map  = get_effective_mastery_map(user_id, session)
        all_questions = session.exec(select(Question)).all()
        concept_names = {c.id: c.name for c in all_concepts}

        # Group questions by concept
        by_concept: dict = {}
        for q in all_questions:
            by_concept.setdefault(q.concept_id, []).append(q)

        # Sort concepts by mastery ascending (weakest first), sample from them
        sorted_concepts = sorted(all_concepts, key=lambda c: mastery_map.get(c.id, 0))

        selected = []
        used_concepts = set()

        # Try to get questions from weakest concepts first, one per concept
        for concept in sorted_concepts:
            if len(selected) >= count:
                break
            qs = by_concept.get(concept.id, [])
            if not qs or concept.id in used_concepts:
                continue
            # Pick random question from this concept
            q = random.choice(qs)
            selected.append({
                "question": q,
                "concept_name": concept_names.get(q.concept_id, q.concept_id),
                "mastery": round(mastery_map.get(q.concept_id, 0), 3),
            })
            used_concepts.add(concept.id)

        # If still not enough, fill from any remaining questions
        remaining_qs = [q for q in all_questions if q.concept_id not in used_concepts]
        random.shuffle(remaining_qs)
        for q in remaining_qs:
            if len(selected) >= count:
                break
            selected.append({
                "question": q,
                "concept_name": concept_names.get(q.concept_id, q.concept_id),
                "mastery": round(mastery_map.get(q.concept_id, 0), 3),
            })

        return {"questions": selected[:count], "duration_seconds": count * 9 * 60}

@app.get("/revision-plan/{user_id}")
def revision_plan(user_id: str):
    with Session(engine) as session:
        mastery_map = get_effective_mastery_map(user_id, session)
        all_concepts = session.exec(select(Concept)).all()
        concept_names = {c.id: c.name for c in all_concepts}

        mastery_data = [
            {
                "concept_id": cid,
                "concept_name": concept_names.get(cid, cid),
                "effective_mastery": round(em, 4),
            }
            for cid, em in mastery_map.items()
        ]

    plan = generate_revision_plan(mastery_data, user_id=user_id)
    return plan