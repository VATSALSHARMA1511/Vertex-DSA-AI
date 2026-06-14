# ▲ Vertex — Adaptive DSA Mastery Tutor

> An AI-powered DSA learning system that adapts to how well *you* know each topic — not a static question bank.

**Live demo:** `(add your Vercel URL here)`  
**Backend:** `(add your Railway URL here)`

---

## What it does

Vertex tracks your mastery of 40 DSA concepts across 165 questions using **Bayesian Knowledge Tracing** — the same algorithm used in Khan Academy and Duolingo. The more you answer, the smarter it gets about what to show you next.

- Answers a question wrong on Two Pointers? It serves Two Pointers again sooner, at a lower difficulty.
- Haven't touched Graphs in 3 days? Your mastery score decays — Vertex notices and prioritises it.
- Upload your own notes? Explanations are pulled directly from *your* material via RAG.

---

## Features

### Adaptive Practice
- **BKT engine** — mastery scores (0–1) per concept, updated after every attempt with decay over time
- **Prerequisite gating** — you won't see Dijkstra until your Graph BFS/DFS mastery clears 40%
- **Smart question selection** — always serves your lowest-mastery unlocked concept
- **AI grading** — LLM grades your written approach against the canonical solution, checks algorithm correctness *and* time/space complexity explicitly

### Mock Interview Mode
- 5 questions · 45-minute countdown · no skipping
- Questions biased toward your weakest concepts
- Full report card at the end: score, per-question feedback, optimal approaches

### Personal Notes (RAG)
- Upload `.pdf`, `.md`, `.txt`, `.docx` study notes
- Notes are chunked, embedded with `sentence-transformers`, and stored in ChromaDB per user
- Wrong answer explanations are grounded in *your* notes first, with fallback to general CS knowledge
- LLM is instructed to trust established CS over potentially incorrect notes

### Analytics
- **Activity heatmap** — GitHub-style 52-week grid, colour = accuracy, intensity = volume
- **Stats dashboard** — accuracy over time (line chart), time per question (bar chart), per-concept breakdown table
- **Streak tracking**, active days, longest streak

### Mastery Map
- All 40 concepts displayed as cards, colour-coded green → red by mastery
- Sorted weakest-first so you always know where to focus

### Revision Plan
- LLM-generated daily study plan from your current mastery scores
- Falls back to pure-Python selection (3 lowest concepts) if LLM unavailable

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLModel, SQLite |
| Mastery engine | Custom BKT implementation (pure math, no ML) |
| Embeddings | `sentence-transformers` — `all-MiniLM-L6-v2` |
| Vector store | ChromaDB (local persistent) |
| LLM | Groq — `llama-3.3-70b-versatile` |
| Frontend | React + Vite, plain CSS, pure SVG charts (no chart library) |
| Deployment | Railway (backend) + Vercel (frontend) |

No Docker. No Redis. No auth library. No chart library. Everything either built from scratch or chosen to be as lightweight as possible.

---

## Architecture

```
User answer (text)
      │
      ▼
LLM grader (Groq)          ← checks algorithm + complexity
      │
      ├── correct=True  → BKT update (mastery ↑)
      └── correct=False → BKT update (mastery ↓)
                               + RAG retrieval (user's notes → ChromaDB)
                               + Socratic explanation (Groq)

Next question selection:
  1. Filter concepts where all prerequisites ≥ 0.4 mastery
  2. Apply time-based decay to mastery scores
  3. Pick lowest effective mastery among eligible concepts
  4. Serve unattempted question (or least recently attempted)
```

---

## Running locally

**Prerequisites:** Python 3.11+, Node 18+, a [Groq API key](https://console.groq.com) (free)

```bash
# Clone
git clone https://github.com/VATSALSHARMA1511/Vertex-DSA-AI.git
cd Vertex-DSA-AI

# Backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Mac/Linux

pip install -r requirements.txt

# Add your Groq key
echo "GROQ_API_KEY=your_key_here" > .env

uvicorn main:app --reload
# Server runs on http://127.0.0.1:8000
```

```bash
# Frontend (new terminal)
cd vertex-frontend
npm install
npm run dev
# Opens on http://localhost:5173
```

No database setup needed — SQLite seeds automatically on first run with all 40 concepts and 165 questions.

---

## Project structure

```
Vertex-DSA-AI/
├── main.py              # FastAPI app, all endpoints
├── bkt.py               # Bayesian Knowledge Tracing engine
├── rag.py               # Chunking, embedding, ChromaDB ingestion + retrieval
├── llm_agents.py        # Groq LLM: grading, explanation, revision plan
├── concepts.json        # 40 DSA concepts with prerequisite graph
├── questions.json       # 165 questions with expected approaches
├── requirements.txt
├── app.db               # SQLite (auto-created)
├── chroma_db/           # ChromaDB vector store (auto-created)
└── vertex-frontend/
    └── src/
        ├── App.jsx      # All React components
        └── App.css      # Styles
```

---

## DSA coverage

40 concepts across the full interview syllabus:

**Fundamentals** — Arrays, Strings, Math, Bit Manipulation  
**Linear structures** — Linked Lists, Stacks, Queues, Monotonic Stack, Heap  
**Search & Sort** — Binary Search, Sorting, Two Pointers, Sliding Window, Prefix Sum  
**Trees** — Binary Trees, BST, Tries, Segment Tree, Fenwick Tree  
**Graphs** — BFS/DFS, Shortest Paths (Dijkstra, Bellman-Ford, Floyd-Warshall), MST (Kruskal, Prim), DSU, Topological Sort, SCC  
**Algorithms** — Recursion, Backtracking, Divide & Conquer, Greedy  
**Dynamic Programming** — 1D DP, 2D DP, DP on Strings/Trees/Graphs, Bitmask DP, Digit DP  
**Other** — Interval Problems, Matrix, Advanced Math

---

## How BKT works

Each concept has a mastery probability `p ∈ [0, 1]`. After every attempt:

```
p(mastery | correct)   = (p_transit + p_mastery) * p_correct_known   / p_correct_total
p(mastery | incorrect) = p_mastery * p_slip / p_incorrect_total
```

Parameters: `p_init=0.1`, `p_transit=0.1`, `p_slip=0.1`, `p_guess=0.2`

Mastery also **decays** with time (`decay_rate=0.03/day`) so concepts you haven't touched in a week score lower. This prevents the system from thinking you know something you've forgotten.

---

## Why this project

Built this because every DSA practice tool I used (Leetcode, GFG, Striver sheets) treats all concepts equally regardless of what you already know. Vertex is the tool I wanted when preparing for placements — one that knows you haven't done Graphs in 5 days and automatically sends you there.

---

## Author

**Vatsal Sharma**  
B.Tech CSE, VIT Vellore (3rd year)  
[GitHub](https://github.com/VATSALSHARMA1511) · [LinkedIn](https://linkedin.com/in/) *(add your LinkedIn)*

---

*Built with FastAPI · React · Groq · ChromaDB · sentence-transformers*