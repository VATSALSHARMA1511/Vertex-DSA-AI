import json
import os
from typing import Optional

from dotenv import load_dotenv
from groq import Groq

from rag import retrieve_notes

load_dotenv()

# ---------------------------------------------------------------------------
# Groq client — instantiated once, reused across calls
# ---------------------------------------------------------------------------

def _get_client() -> Optional[Groq]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        return Groq(api_key=api_key)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Agent 1: grade_attempt
# ---------------------------------------------------------------------------

def grade_attempt(question_text: str, expected_approach: str, user_approach: str) -> dict:
    """
    Strict grading: checks algorithm correctness, time/space complexity.
    Returns {correct: bool, feedback: str, complexity_feedback: str, expected_approach: str}
    """
    FALLBACK = {
        "correct": False,
        "feedback": "Could not grade your answer automatically. Review the expected approach below.",
        "complexity_feedback": "",
        "expected_approach": expected_approach,
    }

    if not user_approach or not user_approach.strip():
        return {
            "correct": False,
            "feedback": "No approach was written. Try explaining your thinking before submitting.",
            "complexity_feedback": "",
            "expected_approach": expected_approach,
        }

    if len(user_approach.strip().split()) < 15:
        return {
            "correct": False,
            "feedback": "Your answer is too brief. Explain the algorithm, why it works, and its time and space complexity.",
            "complexity_feedback": "",
            "expected_approach": expected_approach,
        }

    client = _get_client()
    if not client:
        return FALLBACK

    prompt = f"""You are a senior software engineer at a top tech company (Google/Meta level) conducting a DSA interview. You are STRICT. A vague or incomplete answer is WRONG.

Question: {question_text}

Canonical correct approach: {expected_approach}

Student's answer: {user_approach}

Grade this answer using ALL of the following criteria. The student must satisfy ALL of them to be marked correct:

1. ALGORITHM: Does the student name or clearly describe the correct algorithm/technique? A generic description without naming the approach is NOT enough.
2. CORRECTNESS: Is the core logic correct? Does it actually solve the problem?
3. TIME COMPLEXITY: Does the student mention the correct time complexity? If the canonical approach has a known complexity, the student must state it or better.
4. SPACE COMPLEXITY: Does the student mention space complexity? Missing it is acceptable for easy questions but penalise for medium/hard.

STRICT RULES — mark INCORRECT if:
- Student only restates the problem without explaining how to solve it
- Student describes brute force when canonical solution is better
- Student gives right idea but completely wrong complexity
- Answer is vague (e.g. "use a hashmap" with no further explanation)
- Answer is a single sentence summary with no mechanism explained

Be specific: tell the student exactly what they got right, what was missing, and what the correct complexity is.
In complexity_feedback: compare student's stated complexity to optimal — if matched say so, if worse explain optimal and why.

Respond with ONLY valid JSON, no markdown, no preamble:
{{"correct": true or false, "feedback": "<2-3 sentences: what was right/wrong and why>", "complexity_feedback": "<1-2 sentences on time/space complexity comparison>"}}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=300,
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)
        return {
            "correct": bool(parsed.get("correct", False)),
            "feedback": str(parsed.get("feedback", FALLBACK["feedback"])),
            "complexity_feedback": str(parsed.get("complexity_feedback", "")),
            "expected_approach": expected_approach,
        }

    except Exception:
        return FALLBACK


# ---------------------------------------------------------------------------
# Agent 2: explain_mistake
# ---------------------------------------------------------------------------

def explain_mistake(question_text: str, concept_id: str, user_id: str) -> dict:
    """
    Called when a user answers incorrectly.
    Retrieves the user's own notes chunks for context (RAG), then asks Groq
    to explain Socratically: a guiding question first, then the explanation.

    If the user has no notes, falls back gracefully to general CS knowledge.
    Returns: {explanation: str, follow_up_question: str | null}
    Never crashes POST /attempts.
    """
    FALLBACK = {
        "explanation": f"Review the concept '{concept_id}' carefully. Focus on the core algorithm and its time complexity.",
        "follow_up_question": None,
    }

    # Step 1: retrieve this user's relevant notes (RAG grounding)
    try:
        chunks = retrieve_notes(
            query=question_text,
            user_id=user_id,
            concept_id=concept_id,
            k=3,
        )
        context = "\n\n".join(c["chunk"] for c in chunks) if chunks else ""
    except Exception:
        context = ""

    # Step 2: call Groq
    client = _get_client()
    if not client:
        return FALLBACK

    if context:
        notes_section = f"Relevant notes from the student's own uploaded materials:\n{context}"
        notes_instruction = (
            "Use the notes above as context to personalise your explanation. "
            "However, if any note contradicts well-established computer science, "
            "trust your own knowledge over the notes — the notes may contain errors."
        )
    else:
        notes_section = "No personal notes available for this concept."
        notes_instruction = (
            "No personal notes are available, so rely on your own computer science knowledge "
            "to give a clear, accurate Socratic explanation."
        )

    prompt = f"""You are a Socratic DSA tutor. The student just answered this question INCORRECTLY:

Question: {question_text}
Concept: {concept_id}

{notes_section}

{notes_instruction}

Explain the concept Socratically: first ask a guiding question to make the student think,
then give a clear explanation of the correct approach.

Respond with ONLY valid JSON, no markdown, no preamble:
{{"explanation": "<your explanation here>", "follow_up_question": "<a guiding question to deepen understanding>"}}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=512,
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)
        return {
            "explanation": str(parsed.get("explanation", FALLBACK["explanation"])),
            "follow_up_question": parsed.get("follow_up_question"),
        }

    except Exception:
        return FALLBACK


# ---------------------------------------------------------------------------
# Agent 3: generate_revision_plan
# ---------------------------------------------------------------------------

def generate_revision_plan(mastery_data: list[dict], user_id: str) -> dict:
    """
    Given the full mastery table (list of {concept_id, concept_name,
    effective_mastery, ...}), asks Groq to pick 3 priority concepts and
    return a short motivational message.

    user_id is accepted for future RAG integration (e.g. note-aware plans).
    Falls back to pure-Python selection (3 lowest effective_mastery) on any error.
    """
    def python_fallback():
        sorted_concepts = sorted(mastery_data, key=lambda x: x["effective_mastery"])
        return {
            "priority_concepts": [c["concept_id"] for c in sorted_concepts[:3]],
            "message": "Focus on your weakest areas.",
        }

    if not mastery_data:
        return {"priority_concepts": [], "message": "No mastery data yet. Start attempting questions!"}

    client = _get_client()
    if not client:
        return python_fallback()

    mastery_summary = "\n".join(
        f"- {row['concept_id']} ({row.get('concept_name', row['concept_id'])}): {row['effective_mastery']:.2f}"
        for row in sorted(mastery_data, key=lambda x: x["effective_mastery"])
    )

    prompt = f"""You are a DSA study coach. Here are a student's current mastery scores (0 = no mastery, 1 = full mastery):

{mastery_summary}

Based ONLY on these scores (do not re-derive or invent scores), select the 3 concept_ids the student should prioritize TODAY for revision. Choose the weakest concepts the student needs most.

Also write a short, encouraging 1-2 sentence message personalised to their situation.

Respond with ONLY valid JSON, no markdown, no preamble:
{{"priority_concepts": ["concept_id_1", "concept_id_2", "concept_id_3"], "message": "<short encouraging message>"}}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=256,
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)
        priority = parsed.get("priority_concepts", [])
        message = parsed.get("message", "")

        known_ids = {row["concept_id"] for row in mastery_data}
        valid = [c for c in priority if c in known_ids]

        if len(valid) < 3:
            return python_fallback()

        return {
            "priority_concepts": valid[:3],
            "message": str(message) if message else "Focus on your weakest areas.",
        }

    except Exception:
        return python_fallback()
