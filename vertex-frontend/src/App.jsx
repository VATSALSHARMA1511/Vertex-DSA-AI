import { useState, useEffect, useCallback } from "react"
import "./App.css"

const API = "https://vertex-dsa-ai.onrender.com"

function masteryColor(v) {
  if (v >= 0.75) return "var(--clr-green)"
  if (v >= 0.5)  return "var(--clr-yellow)"
  if (v >= 0.25) return "var(--clr-orange)"
  return "var(--clr-red)"
}
function masteryLabel(v) {
  if (v >= 0.75) return "strong"
  if (v >= 0.5)  return "developing"
  if (v >= 0.25) return "weak"
  return "not started"
}

// ─── Mini SVG chart primitives (no libraries) ───────────────────────────────

function LineChart({ data, xKey, yKey, color = "var(--clr-green)", height = 120 }) {
  if (!data || data.length < 2) return (
    <p className="chart-empty">Not enough data yet — keep practising!</p>
  )
  const W = 480, H = height, PAD = { t: 8, r: 8, b: 28, l: 36 }
  const xs = data.map((_, i) => PAD.l + i * (W - PAD.l - PAD.r) / (data.length - 1))
  const vals = data.map(d => d[yKey])
  const minV = Math.min(...vals), maxV = Math.max(...vals)
  const range = maxV - minV || 1
  const ys = vals.map(v => PAD.t + (1 - (v - minV) / range) * (H - PAD.t - PAD.b))
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ")
  const fill = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ")
    + ` L${xs[xs.length-1]},${H - PAD.b} L${xs[0]},${H - PAD.b} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="svg-chart" preserveAspectRatio="none">
      {/* Y gridlines */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = PAD.t + (1 - (v - minV) / range) * (H - PAD.t - PAD.b)
        if (y < PAD.t || y > H - PAD.b) return null
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border)" strokeWidth="0.5" />
            <text x={PAD.l - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-hint)">{v}</text>
          </g>
        )
      })}
      {/* Fill */}
      <path d={fill} fill={color} opacity="0.12" />
      {/* Line */}
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Dots */}
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="3" fill={color} />
      ))}
      {/* X labels */}
      {data.map((d, i) => (
        i % Math.ceil(data.length / 5) === 0 &&
        <text key={i} x={xs[i]} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fill="var(--text-hint)">
          {d[xKey]}
        </text>
      ))}
    </svg>
  )
}

function BarChart({ data, xKey, yKey, colorFn, height = 120 }) {
  if (!data || data.length === 0) return (
    <p className="chart-empty">Not enough data yet — keep practising!</p>
  )
  const W = 480, H = height, PAD = { t: 8, r: 8, b: 28, l: 36 }
  const vals = data.map(d => d[yKey])
  const maxV = Math.max(...vals, 1)
  const barW = Math.max(4, (W - PAD.l - PAD.r) / data.length - 4)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="svg-chart" preserveAspectRatio="none">
      {[0, 50, 100].map(v => {
        const y = PAD.t + (1 - v / maxV) * (H - PAD.t - PAD.b)
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border)" strokeWidth="0.5" />
            <text x={PAD.l - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-hint)">{v}</text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const x = PAD.l + i * (W - PAD.l - PAD.r) / data.length + 2
        const barH = ((d[yKey]) / maxV) * (H - PAD.t - PAD.b)
        const y = H - PAD.b - barH
        const clr = colorFn ? colorFn(d) : "var(--clr-green)"
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={clr} rx="2" opacity="0.85" />
            {i % Math.ceil(data.length / 6) === 0 &&
              <text x={x + barW / 2} y={H - PAD.b + 14} textAnchor="middle" fontSize="8" fill="var(--text-hint)">
                {String(d[xKey]).slice(0, 6)}
              </text>
            }
          </g>
        )
      })}
    </svg>
  )
}

// ─── Username screen ─────────────────────────────────────────────────────────

function generateUserId(name) {
  // Append 4-char random suffix so two people with same name don't collide
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  const suffix = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `${name.toLowerCase().replace(/\s+/g, "_")}_${suffix}`
}

function UsernameScreen({ onEnter }) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) { setError("Please enter a name to continue."); return }
    const userId = generateUserId(trimmed)
    localStorage.setItem("vertex_username", userId)
    localStorage.setItem("vertex_display_name", trimmed)
    onEnter(userId, trimmed)
  }
  function handleKey(e) { if (e.key === "Enter") handleSubmit() }

  return (
    <div className="username-screen">
      <div className="username-card">
        <div className="app-logo-large">▲</div>
        <h1 className="username-title">Vertex</h1>
        <p className="username-subtitle">Adaptive DSA Mastery Tutor</p>
        <label className="field-label" htmlFor="uname">What's your name?</label>
        <input
          id="uname"
          className={`username-input ${error ? "input-error" : ""}`}
          placeholder="e.g. Arjun"
          value={name}
          onChange={e => { setName(e.target.value); setError("") }}
          onKeyDown={handleKey}
          autoFocus
        />
        {error && <p className="input-hint">{error}</p>}
        <button className="btn btn-submit" onClick={handleSubmit}>Start practising →</button>
        <p className="username-note">No account needed. Your progress is saved to this device.</p>
      </div>
    </div>
  )
}

// ─── Mastery Map ─────────────────────────────────────────────────────────────

function MasteryMap({ userId }) {
  const [concepts, setConcepts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    fetch(`${API}/mastery/${userId}`)
      .then(r => r.json())
      .then(data => { setConcepts(data); setLoading(false) })
      .catch(() => { setError("Could not load mastery data."); setLoading(false) })
  }, [userId])

  if (loading) return <p className="status">Loading…</p>
  if (error)   return <p className="status error">{error}</p>

  const sorted = [...concepts].sort((a, b) => a.effective_mastery - b.effective_mastery)

  return (
    <div>
      <p className="section-hint">{concepts.length} concepts tracked — sorted weakest first</p>
      <div className="concept-grid">
        {sorted.map(c => (
          <div key={c.concept_id} className="concept-card">
            <div className="mastery-bar" style={{
              width: `${Math.round(c.effective_mastery * 100)}%`,
              background: masteryColor(c.effective_mastery),
            }} />
            <div className="concept-card-body">
              <span className="concept-name">{c.concept_name}</span>
              <span className="concept-score" style={{ color: masteryColor(c.effective_mastery) }}>
                {Math.round(c.effective_mastery * 100)}%
              </span>
            </div>
            <div className="concept-label">{masteryLabel(c.effective_mastery)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Practice ────────────────────────────────────────────────────────────────

function QuestionSkeleton() {
  return (
    <div className="skeleton-wrap">
      <div className="skeleton skeleton-tag" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-title sk-short" />
      <div className="skeleton skeleton-reason" />
      <div className="skeleton skeleton-textarea" />
    </div>
  )
}

function Practice({ userId, hasNotes, onGoToNotes }) {
  const [question, setQuestion]     = useState(null)
  const [reason, setReason]         = useState("")
  const [approach, setApproach]     = useState("")
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)
  const [startTime, setStartTime]   = useState(null)
  const [empty, setEmpty]           = useState(false)

  const loadQuestion = useCallback(() => {
    setLoading(true); setResult(null); setApproach(""); setError(null); setEmpty(false)
    fetch(`${API}/next-question/${userId}`)
      .then(r => r.json())
      .then(data => { setQuestion(data.question); setReason(data.reason); setStartTime(Date.now()); setLoading(false) })
      .catch(() => { setError("Could not load question."); setLoading(false) })
  }, [userId])

  useEffect(() => { loadQuestion() }, [loadQuestion])

  async function submitAttempt() {
    if (!question) return
    if (!approach.trim()) { setEmpty(true); return }
    setEmpty(false); setSubmitting(true)
    const timeTaken = Math.round((Date.now() - startTime) / 1000)
    try {
      const res = await fetch(`${API}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, question_id: question.id, time_taken_seconds: timeTaken, user_approach: approach }),
      })
      setResult(await res.json())
    } catch { setError("Failed to submit attempt.") }
    finally { setSubmitting(false) }
  }

  if (loading) return <QuestionSkeleton />
  if (error)   return <p className="status error">{error}</p>

  const difficultyDots = question
    ? Array.from({ length: 5 }, (_, i) => <span key={i} className={`dot ${i < question.difficulty ? "dot-filled" : ""}`} />)
    : null

  return (
    <div className="practice-wrap">
      {!hasNotes && (
        <div className="no-notes-banner">
          <span>📎 Add your notes for personalised explanations.</span>
          <button className="banner-link" onClick={onGoToNotes}>Go to My Notes →</button>
        </div>
      )}
      <div className="question-meta">
        <span className="concept-tag">{question.concept_id.replace(/_/g, " ")}</span>
        <span className="difficulty-dots" title={`Difficulty ${question.difficulty}/5`}>{difficultyDots}</span>
      </div>
      <h2 className="question-text">{question.text}</h2>
      <p className="reason-text">{reason}</p>
      {!result ? (
        <>
          <label className="field-label" htmlFor="approach">Your approach — explain how you'd solve this</label>
          <textarea
            id="approach"
            className={`approach-input ${empty ? "input-error" : ""}`}
            placeholder="e.g. I'd use two pointers starting from both ends…"
            value={approach}
            onChange={e => { setApproach(e.target.value); setEmpty(false) }}
            rows={5}
          />
          {empty && <p className="input-hint">Write your approach before submitting — this is how your answer gets graded.</p>}
          <div className="btn-row">
            <button className="btn btn-submit" onClick={submitAttempt} disabled={submitting}>
              {submitting ? "Grading…" : "Submit approach"}
            </button>
            <button className="btn btn-skip" onClick={loadQuestion} disabled={submitting}>
              Skip →
            </button>
          </div>
        </>
      ) : (
        <div className="result-block">
          <div className={`result-badge ${result.correct ? "badge-correct" : "badge-incorrect"}`}>
            {result.correct ? "✓ Correct" : "✗ Incorrect"}
          </div>

          <p className="feedback-text">{result.feedback}</p>

          {result.complexity_feedback && (
            <div className="complexity-block">
              <span className="complexity-label">Complexity</span>
              <p className="complexity-text">{result.complexity_feedback}</p>
            </div>
          )}

          <p className="mastery-update">Mastery updated to <strong>{Math.round(result.new_p_mastery * 100)}%</strong></p>

          {/* Always show canonical approach so user can compare */}
          <div className="canonical-block">
            <span className="canonical-label">Optimal approach</span>
            <p className="canonical-text">{result.expected_approach}</p>
          </div>

          {result.explanation && (
            <div className="explanation-block">
              <p className="explanation-text">{result.explanation.explanation}</p>
              {result.explanation.follow_up_question && (
                <div className="followup">
                  <span className="followup-label">Think about this</span>
                  <p className="followup-text">{result.explanation.follow_up_question}</p>
                </div>
              )}
            </div>
          )}

          <button className="btn btn-next" onClick={loadQuestion}>Next question →</button>
        </div>
      )}
    </div>
  )
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={accent ? { color: accent } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function Stats({ userId, onGoToPractice }) {
  const [data, setData]         = useState(null)
  const [concepts, setConcepts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/stats/${userId}`).then(r => r.json()),
      fetch(`${API}/mastery/${userId}`).then(r => r.json()),
    ])
      .then(([statsData, masteryData]) => {
        setData(statsData)
        // Sort by effective_mastery ascending (weakest first) for the empty state list
        setConcepts([...masteryData].sort((a, b) => a.effective_mastery - b.effective_mastery).slice(0, 8))
        setLoading(false)
      })
      .catch(() => { setError("Could not load stats."); setLoading(false) })
  }, [userId])

  if (loading) return <p className="status">Crunching your numbers…</p>
  if (error)   return <p className="status error">{error}</p>

  const { summary, daily, by_concept, speed_trend } = data

  if (summary.total === 0) return (
    <div className="stats-empty">
      <div className="stats-empty-icon">📊</div>
      <p className="stats-empty-msg">No attempts yet — your stats will appear here after you practice.</p>
      <button className="btn btn-submit" style={{marginTop: "1rem"}} onClick={onGoToPractice}>
        Start practising →
      </button>
      <div className="stats-concepts-preview">
        <p className="stats-concepts-heading">Your weakest concepts to tackle first:</p>
        <div className="stats-concept-chips">
          {concepts.map(c => (
            <span key={c.concept_id} className="concept-chip" style={{borderColor: masteryColor(c.effective_mastery), color: masteryColor(c.effective_mastery)}}>
              {c.concept_name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )

  const accuracyColor = summary.accuracy >= 75
    ? "var(--clr-green)" : summary.accuracy >= 50
    ? "var(--clr-yellow)" : "var(--clr-red)"

  const streakColor = summary.streak >= 5
    ? "var(--clr-green)" : summary.streak >= 2
    ? "var(--clr-yellow)" : "var(--text-primary)"

  function formatTime(s) {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="stats-wrap">

      {/* Summary cards */}
      <div className="stat-cards">
        <StatCard label="Accuracy" value={`${summary.accuracy}%`} sub={`${summary.correct}/${summary.total} correct`} accent={accuracyColor} />
        <StatCard label="Current streak" value={`${summary.streak} 🔥`} sub="consecutive correct" accent={streakColor} />
        <StatCard label="Avg time / question" value={formatTime(summary.avg_time_seconds)} />
        <StatCard label="Concepts attempted" value={summary.concepts_attempted} sub={`of 26 total`} />
      </div>

      {/* Accuracy over time */}
      <div className="chart-block">
        <h3 className="chart-title">Accuracy over time <span className="chart-hint">(last 14 days)</span></h3>
        <LineChart data={daily} xKey="day" yKey="accuracy" color="var(--clr-green)" height={130} />
      </div>

      {/* Speed trend */}
      <div className="chart-block">
        <h3 className="chart-title">Time per question <span className="chart-hint">(last 20 attempts)</span></h3>
        <BarChart
          data={speed_trend}
          xKey="index"
          yKey="time_seconds"
          colorFn={d => d.correct ? "var(--clr-green)" : "var(--clr-red)"}
          height={130}
        />
        <p className="chart-legend">
          <span className="legend-dot" style={{ background: "var(--clr-green)" }} /> Correct
          <span className="legend-dot" style={{ background: "var(--clr-red)", marginLeft: "1rem" }} /> Incorrect
        </p>
      </div>

      {/* Per-concept table */}
      <div className="chart-block">
        <h3 className="chart-title">Breakdown by concept <span className="chart-hint">(weakest first)</span></h3>
        <div className="concept-table-wrap">
          <table className="concept-table">
            <thead>
              <tr>
                <th>Concept</th>
                <th>Attempts</th>
                <th>Accuracy</th>
                <th>Avg time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {by_concept.map(c => (
                <tr key={c.concept_id}>
                  <td className="ct-name">{c.concept_name}</td>
                  <td className="ct-num">{c.attempts}</td>
                  <td className="ct-num" style={{ color: c.accuracy >= 75 ? "var(--clr-green)" : c.accuracy >= 50 ? "var(--clr-yellow)" : "var(--clr-red)" }}>
                    {c.accuracy}%
                  </td>
                  <td className="ct-num">{formatTime(c.avg_time_seconds)}</td>
                  <td>
                    <div className="ct-bar-bg">
                      <div className="ct-bar-fill" style={{
                        width: `${c.accuracy}%`,
                        background: c.accuracy >= 75 ? "var(--clr-green)" : c.accuracy >= 50 ? "var(--clr-yellow)" : "var(--clr-red)",
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

// ─── Revision Plan ───────────────────────────────────────────────────────────

function RevisionPlan({ userId }) {
  const [plan, setPlan]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch(`${API}/revision-plan/${userId}`)
      .then(r => r.json())
      .then(data => { setPlan(data); setLoading(false) })
      .catch(() => { setError("Could not load revision plan."); setLoading(false) })
  }, [userId])

  if (loading) return <p className="status">Generating your plan…</p>
  if (error)   return <p className="status error">{error}</p>

  return (
    <div className="plan-wrap">
      <p className="plan-message">{plan.message}</p>
      <h3 className="plan-heading">Focus on these today</h3>
      <ol className="plan-list">
        {plan.priority_concepts.map((id, i) => (
          <li key={id} className="plan-item">
            <span className="plan-rank">{i + 1}</span>
            <span className="plan-concept">{id.replace(/_/g, " ")}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ─── My Notes ────────────────────────────────────────────────────────────────

function MyNotes({ userId, onNotesUploaded }) {
  const [files, setFiles]         = useState([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)

  function handleFileChange(e) { setFiles(Array.from(e.target.files)); setResult(null); setError(null) }

  async function handleUpload() {
    if (!files.length) { setError("Select at least one file to upload."); return }
    setUploading(true); setResult(null); setError(null)
    const formData = new FormData()
    formData.append("user_id", userId)
    files.forEach(f => formData.append("files", f))
    try {
      const res = await fetch(`${API}/ingest-notes`, { method: "POST", body: formData })
      const d = await res.json()
      if (!res.ok) {
        const detail = d.detail
        setError(typeof detail === "object" && detail.errors
          ? `${detail.message}\n${detail.errors.join("\n")}`
          : String(detail || "Upload failed."))
      } else {
        setResult(d); setFiles([])
        if (onNotesUploaded) onNotesUploaded()
      }
    } catch { setError("Upload failed — could not reach the server.") }
    finally { setUploading(false) }
  }

  return (
    <div className="notes-wrap">
      <h2 className="notes-heading">My Notes</h2>
      <p className="notes-description">
        Upload your study notes and Vertex will use them to personalise explanations
        when you answer incorrectly. Supported formats: <strong>.pdf</strong>, <strong>.md</strong>, <strong>.txt</strong>, <strong>.docx</strong>.
      </p>
      <div className="upload-area">
        <label className="field-label" htmlFor="note-files">Choose files</label>
        <input id="note-files" type="file" multiple accept=".pdf,.md,.txt,.docx" className="file-input" onChange={handleFileChange} />
        {files.length > 0 && (
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={i} className="file-list-item">
                <span className="file-icon">📄</span> {f.name} <span className="file-size">({(f.size / 1024).toFixed(1)} KB)</span>
              </li>
            ))}
          </ul>
        )}
        <div className="btn-row">
          <button className="btn btn-submit" onClick={handleUpload} disabled={uploading || !files.length}>
            {uploading ? "Uploading…" : "Upload notes"}
          </button>
        </div>
      </div>
      {error && <div className="upload-error"><p className="status error" style={{ whiteSpace: "pre-line" }}>{error}</p></div>}
      {result && (
        <div className="upload-result">
          <p className="upload-success">✓ {result.total_chunks} chunks ingested from {result.files_processed.length} file(s).</p>
          <ul className="result-file-list">
            {result.files_processed.map((f, i) => (
              <li key={i} className="result-file-item">
                <span className="file-icon">📄</span> {f.filename}
                <span className="chunk-count"> — {f.chunks} chunk{f.chunks !== 1 ? "s" : ""}</span>
              </li>
            ))}
          </ul>
          {result.skipped_pages && Object.keys(result.skipped_pages).length > 0 && (
            <div className="skipped-warning">
              <p className="skipped-title">⚠ Some PDF pages had no extractable text (possibly scanned):</p>
              <ul className="skipped-list">
                {Object.entries(result.skipped_pages).map(([fname, pages]) => (
                  <li key={fname}><strong>{fname}</strong>: pages {pages.join(", ")}</li>
                ))}
              </ul>
              <p className="skipped-note">Only typed/digital PDFs are supported. Scanned pages are skipped.</p>
            </div>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="partial-errors">
              <p className="skipped-title">Some files could not be processed:</p>
              <ul className="skipped-list">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ─── Heatmap ─────────────────────────────────────────────────────────────────

function Heatmap({ userId }) {
  const [cells, setCells]     = useState([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)  // {x, y, cell}

  useEffect(() => {
    fetch(`${API}/heatmap/${userId}`)
      .then(r => r.json())
      .then(data => { setCells(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [userId])

  if (loading) return <p className="status">Loading heatmap…</p>

  // Build 52-week grid (col = week, row = day of week 0=Sun..6=Sat)
  const CELL = 13, GAP = 3, STEP = CELL + GAP
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

  // cells is 365 days oldest-first
  // Pad front so first cell aligns to correct day-of-week
  const firstDate  = cells.length ? new Date(cells[0].date) : new Date()
  const startDow   = firstDate.getDay()  // 0=Sun
  const padded     = [...Array(startDow).fill(null), ...cells]
  const totalWeeks = Math.ceil(padded.length / 7)

  function cellColor(cell) {
    if (!cell || cell.count === 0) return "var(--heatmap-empty)"
    const accuracy = cell.count > 0 ? cell.correct / cell.count : 0
    if (cell.count >= 10) return accuracy >= 0.7 ? "var(--clr-green)" : "var(--clr-orange)"
    if (cell.count >= 5)  return accuracy >= 0.7 ? "#2d7a52" : "#a04d14"
    if (cell.count >= 2)  return accuracy >= 0.7 ? "#1e5238" : "#6e3410"
    return "var(--heatmap-low)"
  }

  // Month labels: find first week of each month
  const monthLabels = []
  for (let w = 0; w < totalWeeks; w++) {
    const cellIdx = w * 7 - startDow
    if (cellIdx >= 0 && cellIdx < cells.length) {
      const d = new Date(cells[cellIdx].date)
      if (d.getDate() <= 7) {
        monthLabels.push({ week: w, label: MONTHS[d.getMonth()] })
      }
    }
  }

  const svgW = totalWeeks * STEP + 28
  const svgH = 7 * STEP + 24

  const totalAttempts = cells.reduce((s, c) => s + c.count, 0)
  const activeDays    = cells.filter(c => c.count > 0).length
  const longestStreak = (() => {
    let max = 0, cur = 0
    for (const c of cells) { if (c.count > 0) { cur++; max = Math.max(max, cur) } else cur = 0 }
    return max
  })()

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-summary">
        <div className="heatmap-stat"><span className="heatmap-stat-val">{totalAttempts}</span><span className="heatmap-stat-lbl">total attempts</span></div>
        <div className="heatmap-stat"><span className="heatmap-stat-val">{activeDays}</span><span className="heatmap-stat-lbl">active days</span></div>
        <div className="heatmap-stat"><span className="heatmap-stat-val">{longestStreak}</span><span className="heatmap-stat-lbl">longest streak</span></div>
      </div>

      <div className="heatmap-container" style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="heatmap-svg">
          {/* Day labels */}
          {[1,3,5].map(d => (
            <text key={d} x={0} y={d * STEP + CELL - 2} fontSize="9" fill="var(--text-hint)">{DAYS[d].slice(0,2)}</text>
          ))}
          {/* Month labels */}
          {monthLabels.map(({week, label}) => (
            <text key={week} x={28 + week * STEP} y={10} fontSize="9" fill="var(--text-hint)">{label}</text>
          ))}
          {/* Cells */}
          {Array.from({length: totalWeeks}, (_, w) =>
            Array.from({length: 7}, (_, d) => {
              const idx = w * 7 + d - startDow
              const cell = idx >= 0 && idx < cells.length ? cells[idx] : null
              const x = 28 + w * STEP
              const y = 14 + d * STEP
              return (
                <rect
                  key={`${w}-${d}`}
                  x={x} y={y}
                  width={CELL} height={CELL}
                  rx={2}
                  fill={cellColor(cell)}
                  style={{ cursor: cell && cell.count > 0 ? "pointer" : "default" }}
                  onMouseEnter={e => cell && setTooltip({ x: e.clientX, y: e.clientY, cell })}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div className="heatmap-tooltip" style={{ top: tooltip.y - 60, left: tooltip.x - 80 }}>
            <strong>{tooltip.cell.date}</strong>
            <span>{tooltip.cell.count} attempt{tooltip.cell.count !== 1 ? "s" : ""}</span>
            {tooltip.cell.count > 0 && (
              <span>{Math.round(tooltip.cell.correct / tooltip.cell.count * 100)}% correct</span>
            )}
          </div>
        )}
      </div>

      <div className="heatmap-legend">
        <span className="legend-label">Less</span>
        {["var(--heatmap-empty)", "var(--heatmap-low)", "#1e5238", "#2d7a52", "var(--clr-green)"].map((c, i) => (
          <span key={i} className="legend-cell" style={{ background: c }} />
        ))}
        <span className="legend-label">More</span>
      </div>
    </div>
  )
}

// ─── Mock Interview ───────────────────────────────────────────────────────────

const MOCK_DURATION = 45 * 60  // 45 minutes in seconds

function MockInterview({ userId, onExit }) {
  const [phase, setPhase]           = useState("intro")   // intro | active | report
  const [questions, setQuestions]   = useState([])
  const [current, setCurrent]       = useState(0)
  const [approach, setApproach]     = useState("")
  const [timeLeft, setTimeLeft]     = useState(MOCK_DURATION)
  const [startTime, setStartTime]   = useState(null)
  const [qStartTime, setQStartTime] = useState(null)
  const [results, setResults]       = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [empty, setEmpty]           = useState(false)
  const timerRef = useState(null)

  // Countdown ticker
  useEffect(() => {
    if (phase !== "active") return
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); finishInterview(); return 0 }
        return t - 1
      })
    }, 1000)
    timerRef[1](id)
    return () => clearInterval(id)
  }, [phase])

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
  }

  async function startInterview() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/mock-interview/questions/${userId}?count=5`)
      const data = await res.json()
      setQuestions(data.questions)
      setStartTime(Date.now())
      setQStartTime(Date.now())
      setTimeLeft(MOCK_DURATION)
      setPhase("active")
    } catch { alert("Could not load questions. Is the server running?") }
    finally { setLoading(false) }
  }

  async function submitCurrent() {
    if (!approach.trim()) { setEmpty(true); return }
    setEmpty(false)
    setSubmitting(true)
    const q = questions[current].question
    const timeTaken = Math.round((Date.now() - qStartTime) / 1000)
    try {
      const res = await fetch(`${API}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          question_id: q.id,
          time_taken_seconds: timeTaken,
          user_approach: approach,
        }),
      })
      const data = await res.json()
      const newResults = [...results, {
        question: q,
        concept_name: questions[current].concept_name,
        user_approach: approach,
        correct: data.correct,
        feedback: data.feedback,
        complexity_feedback: data.complexity_feedback || "",
        expected_approach: data.expected_approach || q.expected_approach,
        time_taken: timeTaken,
        new_p_mastery: data.new_p_mastery,
      }]
      setResults(newResults)
      if (current + 1 >= questions.length) {
        clearInterval(timerRef[0])
        finishInterview(newResults)
      } else {
        setCurrent(c => c + 1)
        setApproach("")
        setQStartTime(Date.now())
      }
    } catch { alert("Submit failed.") }
    finally { setSubmitting(false) }
  }

  function finishInterview(finalResults) {
    clearInterval(timerRef[0])
    setResults(r => finalResults || r)
    setPhase("report")
  }

  const timerPct  = timeLeft / MOCK_DURATION
  const timerColor = timerPct > 0.5 ? "var(--clr-green)" : timerPct > 0.2 ? "var(--clr-yellow)" : "var(--clr-red)"

  // ── Intro screen ──
  if (phase === "intro") return (
    <div className="mock-intro">
      <div className="mock-intro-card">
        <div className="mock-icon">⏱</div>
        <h2 className="mock-title">Mock Interview</h2>
        <p className="mock-desc">5 questions · 45 minutes · No skipping</p>
        <ul className="mock-rules">
          <li>Questions are selected from your weakest concepts</li>
          <li>Each answer is graded by AI in real time</li>
          <li>Timer runs continuously — manage your time</li>
          <li>You must explain your algorithm <strong>and</strong> state the time/space complexity</li>
          <li>A full report is shown at the end</li>
        </ul>
        <div className="mock-btn-row">
          <button className="btn btn-submit" onClick={startInterview} disabled={loading}>
            {loading ? "Loading questions…" : "Start interview →"}
          </button>
          <button className="btn" onClick={onExit}>Cancel</button>
        </div>
      </div>
    </div>
  )

  // ── Active interview ──
  if (phase === "active") {
    const q = questions[current]
    const diffDots = Array.from({length: 5}, (_, i) => (
      <span key={i} className={`dot ${i < q.question.difficulty ? "dot-filled" : ""}`} />
    ))
    return (
      <div className="mock-active">
        {/* Top bar */}
        <div className="mock-topbar">
          <div className="mock-progress">
            {questions.map((_, i) => (
              <div key={i} className={`mock-progress-dot ${i < current ? "done" : i === current ? "active" : ""}`} />
            ))}
            <span className="mock-progress-label">Question {current + 1} of {questions.length}</span>
          </div>
          <div className="mock-timer" style={{ color: timerColor }}>
            <span className="mock-timer-icon">⏱</span>
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Timer bar */}
        <div className="mock-timer-bar-bg">
          <div className="mock-timer-bar-fill" style={{ width: `${timerPct * 100}%`, background: timerColor }} />
        </div>

        {/* Question */}
        <div className="mock-question-wrap">
          <div className="question-meta">
            <span className="concept-tag">{q.concept_name}</span>
            <span className="difficulty-dots">{diffDots}</span>
          </div>
          <h2 className="question-text">{q.question.text}</h2>

          <label className="field-label" htmlFor="mock-approach">
            Your approach — name the algorithm, explain the logic, state time and space complexity
          </label>
          <textarea
            id="mock-approach"
            className={`approach-input ${empty ? "input-error" : ""}`}
            placeholder="e.g. I'd use a monotonic stack. For each element, pop elements smaller than it — those form pairs. Time: O(n), Space: O(n)..."
            value={approach}
            onChange={e => { setApproach(e.target.value); setEmpty(false) }}
            rows={6}
          />
          {empty && <p className="input-hint">Write your approach before submitting.</p>}

          <div className="btn-row">
            <button className="btn btn-submit" onClick={submitCurrent} disabled={submitting}>
              {submitting ? "Grading…" : current + 1 === questions.length ? "Finish interview" : "Next question →"}
            </button>
            <span className="mock-no-skip">No skipping in interview mode</span>
          </div>
        </div>
      </div>
    )
  }

  // ── Report card ──
  if (phase === "report") {
    const totalCorrect = results.filter(r => r.correct).length
    const totalTime    = results.reduce((s, r) => s + r.time_taken, 0)
    const score        = Math.round(totalCorrect / results.length * 100)
    const scoreColor   = score >= 80 ? "var(--clr-green)" : score >= 60 ? "var(--clr-yellow)" : "var(--clr-red)"
    const verdict      = score >= 80 ? "Strong pass 💪" : score >= 60 ? "Borderline — keep practising" : "Needs work — review the concepts below"

    function fmt(s) { return s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s` }

    return (
      <div className="mock-report">
        <div className="report-header">
          <h2 className="report-title">Interview Complete</h2>
          <div className="report-score" style={{ color: scoreColor }}>{score}%</div>
          <p className="report-verdict">{verdict}</p>
          <div className="report-meta">
            <span>{totalCorrect}/{results.length} correct</span>
            <span>·</span>
            <span>Total time: {fmt(totalTime)}</span>
          </div>
        </div>

        <div className="report-questions">
          {results.map((r, i) => (
            <div key={i} className={`report-item ${r.correct ? "report-correct" : "report-incorrect"}`}>
              <div className="report-item-header">
                <span className="report-q-num">Q{i+1}</span>
                <span className="report-concept">{r.concept_name}</span>
                <span className={`result-badge ${r.correct ? "badge-correct" : "badge-incorrect"}`} style={{marginLeft:"auto"}}>
                  {r.correct ? "Correct" : "Incorrect"}
                </span>
                <span className="report-time">{fmt(r.time_taken)}</span>
              </div>
              <p className="report-q-text">{r.question.text}</p>
              <div className="report-feedback">
                <p className="report-feedback-text">{r.feedback}</p>
                {r.complexity_feedback && (
                  <p className="report-complexity">{r.complexity_feedback}</p>
                )}
              </div>
              <div className="canonical-block" style={{marginTop:"0.5rem"}}>
                <span className="canonical-label">Optimal approach</span>
                <p className="canonical-text">{r.expected_approach}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="report-actions">
          <button className="btn btn-submit" onClick={() => { setPhase("intro"); setResults([]); setCurrent(0); setApproach("") }}>
            Retake interview
          </button>
          <button className="btn" onClick={onExit}>Back to practice</button>
        </div>
      </div>
    )
  }

  return null
}


// ─── App Shell ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "practice", label: "Practice" },
  { id: "mock",     label: "Mock Interview" },
  { id: "stats",    label: "Stats" },
  { id: "heatmap",  label: "Activity" },
  { id: "mastery",  label: "Mastery map" },
  { id: "plan",     label: "Revision plan" },
  { id: "notes",    label: "My Notes" },
]

export default function App() {
  const [userId, setUserId]         = useState(() => localStorage.getItem("vertex_username") || null)
  const [displayName, setDisplayName] = useState(() => localStorage.getItem("vertex_display_name") || null)
  const [tab, setTab]               = useState("practice")
  const [hasNotes, setHasNotes]     = useState(false)
  const [inMock, setInMock]         = useState(false)

  useEffect(() => {
    if (!userId) return
    fetch(`${API}/users/${userId}/has-notes`)
      .then(r => r.json())
      .then(d => setHasNotes(d.has_notes))
      .catch(() => setHasNotes(false))
  }, [userId])

  function handleNotesUploaded() {
    fetch(`${API}/users/${userId}/has-notes`)
      .then(r => r.json())
      .then(d => setHasNotes(d.has_notes))
      .catch(() => {})
  }

  if (!userId) return <UsernameScreen onEnter={(id, name) => { setUserId(id); setDisplayName(name) }} />

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-logo">▲</span>
          Vertex
          <span className="user-badge" title={`Your unique ID: ${userId} — save this to resume progress on another device`}>
            {displayName || userId}
          </span>
        </div>
        <nav className="tab-nav">
          {TABS.map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "tab-active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "notes" && !hasNotes && <span className="notes-dot" title="No notes uploaded yet" />}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {tab === "practice" && !inMock && <Practice userId={userId} hasNotes={hasNotes} onGoToNotes={() => setTab("notes")} />}
        {tab === "mock"     && (inMock
          ? <MockInterview userId={userId} onExit={() => { setInMock(false); setTab("practice") }} />
          : <MockInterview userId={userId} onExit={() => setTab("practice")} />
        )}
        {tab === "stats"    && <Stats userId={userId} onGoToPractice={() => setTab("practice")} />}
        {tab === "heatmap"  && <Heatmap userId={userId} />}
        {tab === "mastery"  && <MasteryMap userId={userId} />}
        {tab === "plan"     && <RevisionPlan userId={userId} />}
        {tab === "notes"    && <MyNotes userId={userId} onNotesUploaded={handleNotesUploaded} />}
      </main>
    </div>
  )
}