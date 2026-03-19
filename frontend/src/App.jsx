import React, { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useLocation, useParams } from 'react-router-dom'

// ─── API helper ──────────────────────────────────────────────────────────────

const api = async (path, options = {}) => {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Session expired. Please log in again.')
  }
  const text = await res.text()
  let data = {}
  if (text) {
    try { data = JSON.parse(text) }
    catch { data = { detail: text } }
  }
  if (!res.ok) throw new Error(data?.detail || `Request failed (${res.status})`)
  return data
}

// ─── Download helper ─────────────────────────────────────────────────────────

function downloadMd(content, query) {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sentinella-${slug}-${date}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return ''
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(\d+)\]/g, '<sup class="cite">[$1]</sup>')

  const lines = text.split('\n')
  const out = []
  let ulOpen = false
  let olOpen = false

  const closeList = () => {
    if (ulOpen) { out.push('</ul>'); ulOpen = false }
    if (olOpen) { out.push('</ol>'); olOpen = false }
  }

  for (const line of lines) {
    if (/^### /.test(line)) {
      closeList(); out.push(`<h3>${inline(esc(line.slice(4)))}</h3>`)
    } else if (/^## /.test(line)) {
      closeList(); out.push(`<h2>${inline(esc(line.slice(3)))}</h2>`)
    } else if (/^# /.test(line)) {
      closeList(); out.push(`<h1>${inline(esc(line.slice(2)))}</h1>`)
    } else if (/^[-*] /.test(line)) {
      if (olOpen) { out.push('</ol>'); olOpen = false }
      if (!ulOpen) { out.push('<ul>'); ulOpen = true }
      out.push(`<li>${inline(esc(line.slice(2)))}</li>`)
    } else if (/^\d+\.\s/.test(line)) {
      if (ulOpen) { out.push('</ul>'); ulOpen = false }
      if (!olOpen) { out.push('<ol>'); olOpen = true }
      out.push(`<li>${inline(esc(line.replace(/^\d+\.\s/, '')))}</li>`)
    } else if (line.trim() === '') {
      closeList(); out.push('<br>')
    } else {
      closeList(); out.push(`<p>${inline(esc(line))}</p>`)
    }
  }
  closeList()
  return out.join('')
}

function MarkdownView({ content }) {
  return (
    <div
      className="digest-rendered"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  )
}

// ─── Toast system ─────────────────────────────────────────────────────────────

let _addToast = null

function showToast(message, type = 'success') {
  if (_addToast) _addToast({ message, type, id: Date.now() + Math.random() })
}

function ToastContainer() {
  const [toasts, setToasts] = useState([])
  _addToast = (t) => {
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
  }
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  )
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Spinner() { return <span className="spinner" /> }

function Alert({ type = 'error', children }) {
  return (
    <div className={`alert alert-${type}`}>
      <span>{type === 'error' ? '⚠' : '✓'}</span>
      <span>{children}</span>
    </div>
  )
}

function Badge({ variant, children }) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

function EmptyState({ icon, text }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-text">{text}</div>
    </div>
  )
}

function Tooltip({ text }) {
  return (
    <span className="tooltip-wrap">
      <span className="tooltip-icon">?</span>
      <span className="tooltip-box">{text}</span>
    </span>
  )
}

function TagList({ tags }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="tag-list">
      {tags.map(t => <span key={t} className="tag">{t}</span>)}
    </div>
  )
}

const LANGUAGES = ['italiano', 'english', 'español', 'français', 'deutsch']

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Health dots (sidebar) ────────────────────────────────────────────────────

function HealthDots() {
  const [status, setStatus] = useState({ searxng: 'loading', ollama: 'loading' })

  useEffect(() => {
    api('/api/health/services')
      .then(s => setStatus(s))
      .catch(() => setStatus({ searxng: 'error', ollama: 'error' }))
    const id = setInterval(() => {
      api('/api/health/services')
        .then(s => setStatus(s))
        .catch(() => setStatus({ searxng: 'error', ollama: 'error' }))
    }, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="health-dots">
      {[['SearXNG', status.searxng], ['Ollama', status.ollama]].map(([label, st]) => (
        <div className="health-dot-row" key={label}>
          <span className={`health-dot ${st}`} title={st} />
          {label}
        </div>
      ))}
    </div>
  )
}

// ─── Layout / Sidebar ─────────────────────────────────────────────────────────

function Layout({ children }) {
  const location = useLocation()
  const nav = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Detect admin from JWT (decode payload without verification — UI only)
  let isAdmin = false
  try {
    const token = localStorage.getItem('token')
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]))
      isAdmin = payload.role === 'admin'
    }
  } catch { /* ignore */ }

  const logout = () => {
    localStorage.removeItem('token')
    nav('/login')
  }

  const navLinks = [
    { to: '/ask',         label: 'Ask',         icon: '🔍' },
    { to: '/watchlist',   label: 'Watchlist',   icon: '👁' },
    { to: '/runs',        label: 'Runs',        icon: '📋' },
    ...(isAdmin ? [
      { to: '/admin/users', label: 'Admin Users', icon: '👤' },
      { to: '/admin/stats', label: 'Statistics', icon: '📊' },
    ] : []),
  ]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">👁</div>
          <div>
            <div className="sidebar-brand-name">Sentinella</div>
            <div className="sidebar-brand-sub">Web Intelligence</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navLinks.map(({ to, label, icon }) => (
            <Link
              key={to}
              to={to}
              className={location.pathname.startsWith(to) ? 'active' : ''}
            >
              <span className="sidebar-nav-icon">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        <HealthDots />

        <div className="sidebar-footer">
          <Link
            to="/profile"
            className="btn-logout"
            style={{ marginBottom: 6, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span>⚙</span> Profile
          </Link>
          <button className="btn-logout" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            <span>{theme === 'dark' ? '☀' : '🌙'}</span> {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button className="btn-logout" onClick={logout}>
            <span>⏻</span> Logout
          </button>
        </div>
      </aside>

      <main>{children}</main>
      <ToastContainer />
    </div>
  )
}

// ─── Login ────────────────────────────────────────────────────────────────────

function Login() {
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const out = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      if (out?.access_token) {
        localStorage.setItem('token', out.access_token)
        nav('/ask')
      }
    } catch (err) {
      setError(err?.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">👁</div>
          <div className="login-brand-text">
            <h1>Sentinella</h1>
            <p>Web Intelligence Platform</p>
          </div>
        </div>
        <form onSubmit={submit} className="form-stack">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input id="username" autoFocus autoComplete="username" placeholder="admin"
              value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <button className="btn btn-primary" disabled={loading || !username || !password}>
            {loading ? <><Spinner /> Signing in…</> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Ask ──────────────────────────────────────────────────────────────────────

function Ask() {
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('italiano')
  const [recencyDays, setRecencyDays] = useState(7)
  const [maxResults, setMaxResults] = useState(5)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true); setResult(null)
    try {
      const out = await api('/api/ask', {
        method: 'POST',
        body: JSON.stringify({ query, recency_days: recencyDays, max_results: maxResults, domains_allow: [], domains_block: [], output_language: language, custom_prompt: customPrompt || null }),
      })
      setResult(out)
    } catch (err) {
      setError(err?.message || 'Search error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Ask</div>
        <div className="page-subtitle">Instant web search with AI digest</div>
      </div>

      <div className="card">
        <form onSubmit={submit} className="form-stack">
          <div className="form-group">
            <label>Query <Tooltip text='Topic or question to gather information on. E.g. "kubernetes 1.30 news", "qdrant release changelog"' /></label>
            <textarea rows={3} placeholder="E.g. qdrant release changelog, kubernetes 1.30 news…"
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div className="form-group" style={{ maxWidth: 220 }}>
            <label>Output language <Tooltip text="Language the AI will use to write the digest. Does not affect the web search language." /></label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => setShowAdvanced(p => !p)}>
              {showAdvanced ? '▲ Hide options' : '▼ Advanced options'}
            </button>
          </div>
          {showAdvanced && (
            <div className="form-row">
              <div className="form-group">
                <label>Recency days <Tooltip text="Filter results to the last N days. 1 = today, 7 = week, 30 = month, 365 = year." /></label>
                <input type="number" min={1} max={365} value={recencyDays}
                  onChange={e => setRecencyDays(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Max results <Tooltip text="Maximum number of sources to analyse (1–20). More sources = richer digest but slower execution." /></label>
                <input type="number" min={1} max={20} value={maxResults}
                  onChange={e => setMaxResults(Number(e.target.value))} />
              </div>
            </div>
          )}
          <div>
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => setShowPrompt(p => !p)}>
              {showPrompt ? '▲ Hide prompt' : '▼ Custom prompt'}
            </button>
          </div>
          {showPrompt && (
            <div className="form-group">
              <label>Custom prompt <Tooltip text="Alternative instruction for the AI. Leave empty for the default prompt (title + bullets + sources). Query and sources are always appended automatically." /></label>
              <textarea rows={3} placeholder="Leave empty to use the default prompt"
                value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} />
            </div>
          )}
          {error && <Alert type="error">{error}</Alert>}
          <div>
            <button className="btn btn-primary" disabled={loading || !query.trim()}>
              {loading ? <><Spinner /> Processing…</> : '🔍 Search'}
            </button>
          </div>
        </form>
      </div>

      {result && (
        <>
          <div className="divider" />
          <div className="run-detail-header">
            <div>
              <div className="page-title" style={{ fontSize: 15 }}>Digest</div>
              <div className="page-subtitle">Run #{result.id} · {fmtDate(result.created_at)}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadMd(result.digest_md, result.query)}>
              ⬇ Download .md
            </button>
          </div>
          <MarkdownView content={result.digest_md} />
        </>
      )}
    </Layout>
  )
}

// ─── CronPicker ───────────────────────────────────────────────────────────────

const DAYS_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function parseCron(cron) {
  const hourlyMatch = cron.match(/^0 \*\/(\d+) \* \* \*$/)
  if (hourlyMatch) return { mode: 'hourly', hours: Number(hourlyMatch[1]), time: '08:00', days: [1], raw: cron }
  const dailyMatch = cron.match(/^(\d+) (\d+) \* \* \*$/)
  if (dailyMatch) return { mode: 'daily', hours: 6, time: `${dailyMatch[2].padStart(2,'0')}:${dailyMatch[1].padStart(2,'0')}`, days: [1], raw: cron }
  const weeklyMatch = cron.match(/^(\d+) (\d+) \* \* ([\d,]+)$/)
  if (weeklyMatch) return { mode: 'weekly', hours: 6, time: `${weeklyMatch[2].padStart(2,'0')}:${weeklyMatch[1].padStart(2,'0')}`, days: weeklyMatch[3].split(',').map(Number), raw: cron }
  return { mode: 'advanced', hours: 6, time: '08:00', days: [1], raw: cron }
}

function buildCron({ mode, hours, time, days, raw }) {
  const [hh, mm] = (time || '08:00').split(':').map(Number)
  if (mode === 'hourly')  return `0 */${hours} * * *`
  if (mode === 'daily')   return `${mm} ${hh} * * *`
  if (mode === 'weekly')  return `${mm} ${hh} * * ${[...days].sort((a,b)=>a-b).join(',')}`
  return raw
}

function CronPicker({ value, onChange }) {
  const [state, setState] = useState(() => parseCron(value || '0 */6 * * *'))

  const update = (patch) => {
    const next = { ...state, ...patch }
    setState(next)
    onChange(buildCron(next))
  }

  const toggleDay = (d) => {
    const next = state.days.includes(d)
      ? state.days.filter(x => x !== d)
      : [...state.days, d]
    if (next.length === 0) return
    update({ days: next })
  }

  return (
    <div className="cron-picker">
      <select value={state.mode} onChange={e => update({ mode: e.target.value })}>
        <option value="hourly">Hourly</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="advanced">Advanced</option>
      </select>

      {state.mode === 'hourly' && (
        <span className="cron-inline">
          every&nbsp;
          <input type="number" min="1" max="23" value={state.hours}
            onChange={e => update({ hours: Math.max(1, Math.min(23, Number(e.target.value))) })} />
          &nbsp;hours
        </span>
      )}

      {(state.mode === 'daily') && (
        <span className="cron-inline">
          at&nbsp;
          <input type="time" value={state.time} onChange={e => update({ time: e.target.value })} />
        </span>
      )}

      {state.mode === 'weekly' && (
        <span className="cron-inline">
          {DAYS_LABELS.map((label, i) => (
            <button key={i} type="button"
              className={`day-btn${state.days.includes(i) ? ' active' : ''}`}
              onClick={() => toggleDay(i)}>{label}</button>
          ))}
          &nbsp;at&nbsp;
          <input type="time" value={state.time} onChange={e => update({ time: e.target.value })} />
        </span>
      )}

      {state.mode === 'advanced' && (
        <input className="cron-raw" placeholder="* * * * *" value={state.raw}
          onChange={e => update({ raw: e.target.value })} />
      )}

      <span className="cron-preview">{buildCron(state)}</span>
    </div>
  )
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

const defaultForm = {
  name: '', query: '', cron: '0 8 * * *',
  recency_days: 7, max_results: 5,
  domains_allow: '', domains_block: '',
  tags: '', output_language: 'italiano', custom_prompt: '',
}

function Watchlist() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [editingItem, setEditingItem] = useState(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(null)
  const [lastRun, setLastRun] = useState(null)
  const [error, setError] = useState('')
  const [previewResults, setPreviewResults] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [exporting, setExporting] = useState(null)

  const isAdmin = useMemo(() => {
    try { return JSON.parse(atob(localStorage.getItem('token').split('.')[1])).role === 'admin' }
    catch { return false }
  }, [])

  const load = async () => setItems(await api('/api/watchlist') || [])
  useEffect(() => { load() }, [])

  const startEdit = (item) => {
    setEditingItem(item)
    setForm({
      name: item.name, query: item.query, cron: item.cron,
      recency_days: item.recency_days, max_results: item.max_results,
      domains_allow: item.domains_allow.join(', '),
      domains_block: item.domains_block.join(', '),
      tags: item.tags.join(', '),
      output_language: item.output_language,
      custom_prompt: item.custom_prompt || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => { setEditingItem(null); setForm(defaultForm) }

  const save = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const body = {
      ...form,
      recency_days: Number(form.recency_days),
      max_results: Number(form.max_results),
      domains_allow: form.domains_allow.split(',').map(s => s.trim()).filter(Boolean),
      domains_block: form.domains_block.split(',').map(s => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
      enabled: editingItem ? editingItem.enabled : true,
      custom_prompt: form.custom_prompt || null,
    }
    try {
      if (editingItem) {
        const path = editingItem.scope === 'global'
          ? `/api/watchlist/global/${editingItem.id}`
          : `/api/watchlist/personal/${editingItem.id}`
        await api(path, { method: 'PUT', body: JSON.stringify(body) })
        showToast(`Watchlist "${form.name}" updated.`)
        setEditingItem(null)
      } else {
        await api('/api/watchlist/personal', { method: 'POST', body: JSON.stringify(body) })
        showToast('Watchlist created successfully.')
      }
      setForm(defaultForm)
      load()
    } catch (err) {
      showToast(err?.message || 'Error saving watchlist', 'error')
    } finally {
      setLoading(false)
    }
  }

  const runNow = async (id) => {
    setRunning(id)
    try {
      const result = await api(`/api/watchlist/${id}/run`, { method: 'POST' })
      setLastRun({ watchId: id, runId: result.id })
      showToast(`Run completed! Open run #${result.id}`)
      load()
    } catch (err) {
      showToast(err?.message || 'Run error', 'error')
    } finally { setRunning(null) }
  }

  const deleteWatch = async (item) => {
    if (!confirm(`Delete "${item.name}" and all its runs?\nThis action cannot be undone.`)) return
    const path = item.scope === 'global'
      ? `/api/watchlist/global/${item.id}`
      : `/api/watchlist/personal/${item.id}`
    try {
      await api(path, { method: 'DELETE' })
      showToast(`Watchlist "${item.name}" deleted.`)
      load()
    } catch (err) {
      showToast(err?.message || 'Delete error', 'error')
    }
  }

  const toggle = async (item) => {
    try {
      await api(`/api/watchlist/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !item.enabled }),
      })
      load()
    } catch (err) {
      setError(err?.message || 'Error')
    }
  }

  const resetSeen = async (item) => {
    if (!confirm(`Reset seen URLs for "${item.name}"?\nThe next run will reprocess all sources.`)) return
    try {
      await api(`/api/watchlist/${item.id}/seen-items`, { method: 'DELETE' })
      showToast(`Seen URLs reset for "${item.name}".`)
    } catch (err) {
      showToast(err?.message || 'Reset error', 'error')
    }
  }

  const testQuery = async () => {
    setPreviewLoading(true); setPreviewResults(null)
    try {
      const results = await api('/api/search/preview', {
        method: 'POST',
        body: JSON.stringify({
          query: form.query,
          recency_days: Number(form.recency_days),
          max_results: Number(form.max_results),
          domains_allow: form.domains_allow.split(',').map(s => s.trim()).filter(Boolean),
          domains_block: form.domains_block.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      setPreviewResults(results)
    } catch (err) {
      showToast(err?.message || 'Preview error', 'error')
    } finally { setPreviewLoading(false) }
  }

  const exportWatch = async (item) => {
    setExporting(item.id)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/watchlist/${item.id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sentinella-${item.name.toLowerCase().replace(/\s+/g, '-')}-export.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast(err?.message || 'Export error', 'error')
    } finally { setExporting(null) }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Watchlist</div>
        <div className="page-subtitle">Scheduled searches and continuous monitoring</div>
      </div>

      <div className="card">
        <div className="card-title">{editingItem ? `Edit: ${editingItem.name}` : 'New personal watchlist'}</div>
        <form onSubmit={save} className="form-stack">
          <div className="form-row">
            <div className="form-group">
              <label>Name <Tooltip text='Descriptive name for the watchlist. E.g. "Kubernetes updates", "Weekly AI news"' /></label>
              <input placeholder="E.g. Qdrant updates" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Frequency <Tooltip text="How often to run the search automatically. Choose hourly, daily, weekly, or a custom cron expression." /></label>
              <CronPicker value={form.cron} onChange={cron => setForm({ ...form, cron })} />
            </div>
          </div>
          <div className="form-group">
            <label>Query <Tooltip text='Search term passed to the search engine. E.g. "qdrant vector database release"' /></label>
            <input placeholder="E.g. qdrant release changelog" value={form.query}
              onChange={e => setForm({ ...form, query: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Recency days <Tooltip text="Filter results to the last N days. 1 = today, 7 = week, 30 = month, 365 = year." /></label>
              <input type="number" min={1} value={form.recency_days}
                onChange={e => setForm({ ...form, recency_days: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Max results <Tooltip text="Maximum number of sources to analyse per run (1–20). More sources = richer digest but slower execution." /></label>
              <input type="number" min={1} max={20} value={form.max_results}
                onChange={e => setForm({ ...form, max_results: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Allowed domains <Tooltip text="If set, includes ONLY results from these domains. Comma-separated. E.g. github.com, docs.python.org" /></label>
              <input placeholder="github.com, qdrant.tech" value={form.domains_allow}
                onChange={e => setForm({ ...form, domains_allow: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Blocked domains <Tooltip text="Always excludes results from these domains. Supports wildcards. E.g. *.spam.com, reddit.com" /></label>
              <input placeholder="spam.com" value={form.domains_block}
                onChange={e => setForm({ ...form, domains_block: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tags <Tooltip text="Free-form labels to organise watchlists. E.g. tech, ai, security" /></label>
              <input placeholder="tech, ai, monitoring" value={form.tags}
                onChange={e => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Output language <Tooltip text="Language the AI will use to write the digest. Does not affect the web search language." /></label>
              <select value={form.output_language}
                onChange={e => setForm({ ...form, output_language: e.target.value })}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Custom prompt <Tooltip text="Alternative instruction for the AI. Replaces the default instructions; query and sources are always appended automatically." /></label>
            <textarea rows={2} placeholder="Leave empty to use the default prompt"
              value={form.custom_prompt}
              onChange={e => setForm({ ...form, custom_prompt: e.target.value })} />
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={loading || !form.name || !form.query}>
              {loading ? <><Spinner /> Saving…</> : editingItem ? '💾 Save changes' : '+ Create watchlist'}
            </button>
            {form.query && (
              <button type="button" className="btn btn-secondary" disabled={previewLoading}
                onClick={testQuery}>
                {previewLoading ? <><Spinner /> Testing…</> : '🔍 Test query'}
              </button>
            )}
            {editingItem && (
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
            )}
          </div>
          {previewResults !== null && (
            <div className="preview-panel">
              <div className="preview-panel-title">
                Preview — {previewResults.length} result{previewResults.length !== 1 ? 's' : ''}
                <button className="preview-panel-close" onClick={() => setPreviewResults(null)}>✕</button>
              </div>
              {previewResults.length === 0
                ? <div className="preview-empty">No results found. Try changing the query or recency days.</div>
                : previewResults.map((r, i) => (
                  <div className="preview-item" key={i}>
                    <a href={r.url} target="_blank" rel="noreferrer" className="preview-item-title">{r.title}</a>
                    <div className="preview-item-url">{r.url}</div>
                    {r.snippet && <div className="preview-item-snippet">{r.snippet.slice(0, 200)}{r.snippet.length > 200 ? '…' : ''}</div>}
                  </div>
                ))
              }
            </div>
          )}
        </form>
      </div>

      {lastRun && (
        <Alert type="success">
          Run completed. <Link to={`/runs/${lastRun.runId}`} style={{ color: 'inherit', textDecoration: 'underline' }}>Open run #{lastRun.runId} →</Link>
        </Alert>
      )}

      <div className="watch-list">
        {items.length === 0 && <EmptyState icon="👁" text="No watchlists found." />}
        {items.map(item => {
          const canEdit = isAdmin || item.scope === 'personal'
          return (
          <div className="watch-item" key={item.id}>
            <div className="watch-item-info">
              <div className="watch-item-name">{item.name}</div>
              <div className="watch-item-meta">
                <Badge variant={item.scope}>{item.scope}</Badge>
                {!canEdit && <Badge variant="inactive">read-only</Badge>}
                <span className="watch-item-cron">{item.cron}</span>
                <Badge variant="user">{item.output_language}</Badge>
                {!item.enabled && <Badge variant="inactive">disabled</Badge>}
              </div>
              <TagList tags={item.tags} />
              <div className="watch-item-last-run">
                {item.last_run_at ? `Last run: ${fmtDate(item.last_run_at)}` : 'Never run'}
              </div>
            </div>
            {canEdit && (
              <button
                className={`btn btn-sm ${item.enabled ? 'btn-danger' : 'btn-secondary'}`}
                title={item.enabled ? 'Stop scheduling' : 'Resume scheduling'}
                onClick={() => toggle(item)}
              >
                {item.enabled ? '⏸ Pause' : '▶ Resume'}
              </button>
            )}
            {canEdit && (
              <button className="btn btn-secondary btn-sm"
                disabled={running === item.id} onClick={() => runNow(item.id)}>
                {running === item.id ? <Spinner /> : '▶ Run now'}
              </button>
            )}
            {canEdit && (
              <button className="btn btn-secondary btn-sm" title="Reset seen URLs"
                onClick={() => resetSeen(item)}>
                ↺ Reset seen
              </button>
            )}
            {canEdit && (
              <button className="btn btn-secondary btn-sm" title="Export all runs as zip"
                disabled={exporting === item.id} onClick={() => exportWatch(item)}>
                {exporting === item.id ? <Spinner /> : '⬇ Export'}
              </button>
            )}
            {canEdit && (
              <button className="btn btn-secondary btn-sm" title="Edit watchlist"
                onClick={() => startEdit(item)}>
                ✏️
              </button>
            )}
            {canEdit && (
              <button className="btn btn-danger btn-sm" onClick={() => deleteWatch(item)}
                title="Delete watchlist">
                🗑
              </button>
            )}
          </div>
          )
        })}
      </div>
    </Layout>
  )
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

function Runs() {
  const [runs, setRuns] = useState([])
  const [filter, setFilter] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [downloading, setDownloading] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    api('/api/runs').then(data => setRuns(data || []))
  }, [])

  const filtered = runs.filter(r => {
    if (filter && !r.query.toLowerCase().includes(filter.toLowerCase())) return false
    if (filterType === 'ask' && r.watch_id !== null) return false
    if (filterType === 'watch' && r.watch_id === null) return false
    if (filterFrom && new Date(r.created_at) < new Date(filterFrom)) return false
    if (filterTo && new Date(r.created_at) > new Date(filterTo + 'T23:59:59')) return false
    return true
  })

  const handleDownload = async (r) => {
    setDownloading(r.id)
    try {
      const detail = await api(`/api/runs/${r.id}`)
      downloadMd(detail.digest_md || '', detail.query)
    } finally {
      setDownloading(null)
    }
  }

  const handleDelete = async (r) => {
    if (!confirm(`Delete run #${r.id} "${r.query}"?`)) return
    await api(`/api/runs/${r.id}`, { method: 'DELETE' })
    setRuns(prev => prev.filter(x => x.id !== r.id))
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Runs</div>
        <div className="page-subtitle">Execution history</div>
      </div>

      <div className="filter-bar">
        <input placeholder="🔍 Search by query…" value={filter}
          onChange={e => setFilter(e.target.value)} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All</option>
          <option value="ask">Ask only</option>
          <option value="watch">Watchlist only</option>
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} title="From date" />
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} title="To date" />
      </div>

      <div className="runs-list">
        {filtered.length === 0 && (
          <EmptyState icon="📋" text={filter ? 'No results for this search.' : 'No runs found.'} />
        )}
        {filtered.map(r => (
          <div className="run-item" key={r.id} style={{ cursor: 'pointer' }}
            onClick={() => nav(`/runs/${r.id}`)}>
            <span className="run-id">#{r.id}</span>
            <span className="run-query">{r.query}</span>
            {r.watch_id && <Badge variant="personal">watch #{r.watch_id}</Badge>}
            <span className="run-date">{fmtDate(r.created_at)}</span>
            <button className="btn btn-secondary btn-sm"
              disabled={downloading === r.id}
              onClick={e => { e.stopPropagation(); handleDownload(r) }}>
              {downloading === r.id ? <Spinner /> : '⬇ .md'}
            </button>
            <button className="btn btn-danger btn-sm"
              onClick={e => { e.stopPropagation(); handleDelete(r) }}>
              🗑
            </button>
          </div>
        ))}
      </div>
    </Layout>
  )
}

// ─── Run Detail ───────────────────────────────────────────────────────────────

function RunDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/runs/${id}`)
      .then(setRun)
      .catch(err => setError(err?.message || 'Error'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <Layout>
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spinner />
        </div>
      )}
      {error && <Alert type="error">{error}</Alert>}
      {run && (
        <>
          <div className="run-detail-header">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <div className="page-title">Run #{run.id}</div>
              <div className="page-subtitle">{run.query} · {fmtDate(run.created_at)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => nav('/runs')}>
                ← Back to Runs
              </button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => downloadMd(run.digest_md, run.query)}>
                ⬇ Download .md
              </button>
            </div>
          </div>

          <MarkdownView content={run.digest_md} />

          {run.items && run.items.length > 0 && (
            <>
              <div className="divider" />
              <div className="card-title" style={{ marginTop: 4 }}>Sources ({run.items.length})</div>
              <div className="sources-list">
                {run.items.map((item, i) => (
                  <div className="source-item" key={i}>
                    <div className="source-title">[{i + 1}] {item.title}</div>
                    <a className="source-url" href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  )
}

// ─── Admin Users ──────────────────────────────────────────────────────────────

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ username: '', password: '', role: 'user' })
  const [loading, setLoading] = useState(false)
  const [quotaEditing, setQuotaEditing] = useState(null) // { id, max_watches, max_daily_runs }

  let currentUserId = null
  try {
    const token = localStorage.getItem('token')
    if (token) currentUserId = parseInt(JSON.parse(atob(token.split('.')[1])).sub)
  } catch { /* ignore */ }

  const load = async () => setUsers(await api('/api/admin/users') || [])
  useEffect(() => { load() }, [])

  const saveQuota = async () => {
    if (!quotaEditing) return
    try {
      await api(`/api/admin/users/${quotaEditing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          max_watches: quotaEditing.max_watches === '' ? null : Number(quotaEditing.max_watches),
          max_daily_runs: quotaEditing.max_daily_runs === '' ? null : Number(quotaEditing.max_daily_runs),
        }),
      })
      showToast('Quota updated.')
      setQuotaEditing(null)
      load()
    } catch (err) {
      showToast(err?.message || 'Error updating quota', 'error')
    }
  }

  const create = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) })
      showToast(`User "${form.username}" created.`)
      setForm({ username: '', password: '', role: 'user' })
      load()
    } catch (err) {
      showToast(err?.message || 'Error creating user', 'error')
    } finally {
      setLoading(false)
    }
  }

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"?`)) return
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' })
      showToast(`User "${u.username}" deleted.`)
      load()
    } catch (err) {
      showToast(err?.message || 'Error deleting user', 'error')
    }
  }

  const toggleActive = async (u) => {
    try {
      await api(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !u.is_active }),
      })
      showToast(`User "${u.username}" ${u.is_active ? 'deactivated' : 'reactivated'}.`)
      load()
    } catch (err) {
      showToast(err?.message || 'Error', 'error')
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Admin Users</div>
        <div className="page-subtitle">User and role management</div>
      </div>

      <div className="card">
        <div className="card-title">Create new user</div>
        <form onSubmit={create} className="form-stack">
          <div className="form-row">
            <div className="form-group">
              <label>Username</label>
              <input placeholder="mario.rossi" value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" placeholder="Initial password" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <button className="btn btn-primary" disabled={loading || !form.username || !form.password}>
              {loading ? <><Spinner /> Creating…</> : '+ Create user'}
            </button>
          </div>
        </form>
      </div>

      <div className="users-list">
        {users.length === 0 && <EmptyState icon="👤" text="No users found." />}
        {users.map(u => (
          <div className="user-item" key={u.id}>
            <div className="user-avatar">{u.username[0].toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{u.username}</div>
              <div className="user-meta">
                <Badge variant={u.role}>{u.role}</Badge>
                <Badge variant={u.is_active ? 'active' : 'inactive'}>
                  {u.is_active ? 'active' : 'deactivated'}
                </Badge>
              </div>
            </div>
            <div className="user-quota">
              <span title="Max watchlists">👁 {u.max_watches ?? '∞'}</span>
              <span title="Max runs/day">▶ {u.max_daily_runs ?? '∞'}/day</span>
            </div>
            {quotaEditing?.id === u.id ? (
              <div className="quota-edit-form">
                <input type="number" min="1" placeholder="∞ watches"
                  value={quotaEditing.max_watches}
                  onChange={e => setQuotaEditing({ ...quotaEditing, max_watches: e.target.value })} />
                <input type="number" min="1" placeholder="∞ runs/day"
                  value={quotaEditing.max_daily_runs}
                  onChange={e => setQuotaEditing({ ...quotaEditing, max_daily_runs: e.target.value })} />
                <button className="btn btn-primary btn-sm" onClick={saveQuota}>Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setQuotaEditing(null)}>✕</button>
              </div>
            ) : (
              <button className="btn btn-secondary btn-sm"
                onClick={() => setQuotaEditing({ id: u.id, max_watches: u.max_watches ?? '', max_daily_runs: u.max_daily_runs ?? '' })}>
                Set quota
              </button>
            )}
            {u.id !== currentUserId && (
              <>
                <button className={`btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => toggleActive(u)}>
                  {u.is_active ? '⏸ Deactivate' : '▶ Reactivate'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u)}>Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
    </Layout>
  )
}

// ─── Admin Stats ──────────────────────────────────────────────────────────────

function AdminStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/admin/stats')
      .then(setStats)
      .catch(err => setError(err?.message || 'Error'))
      .finally(() => setLoading(false))
  }, [])

  const maxCount = stats ? Math.max(...stats.runs_per_day.map(r => r.count), 1) : 1

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Statistics</div>
        <div className="page-subtitle">Platform activity overview</div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>}
      {error && <Alert type="error">{error}</Alert>}

      {stats && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Users</div>
              <div className="stat-value">{stats.total_users}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Watchlist</div>
              <div className="stat-value">{stats.total_watches}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total runs</div>
              <div className="stat-value">{stats.total_runs}</div>
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">Runs per day (last 14 days)</div>
            {stats.runs_per_day.length === 0 ? (
              <EmptyState icon="📊" text="No runs in the last 14 days." />
            ) : (
              <div className="chart-bars">
                {stats.runs_per_day.map(r => (
                  <div className="chart-bar-wrap" key={r.day} title={`${r.day}: ${r.count} run`}>
                    <div className="chart-bar"
                      style={{ height: `${Math.max(4, Math.round((r.count / maxCount) * 100))}%` }} />
                    <div className="chart-bar-label">{r.day.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Most active watchlists</div>
            <div className="top-watches-list">
              {stats.top_watches.length === 0 && (
                <EmptyState icon="👁" text="No watchlists with runs." />
              )}
              {stats.top_watches.map((w, i) => (
                <div className="top-watch-item" key={w.id}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12, minWidth: 20 }}>#{i + 1}</span>
                  <span className="top-watch-name">{w.name}</span>
                  <span className="top-watch-count">{w.run_count} run</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function Profile() {
  const [me, setMe] = useState(null)
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api('/api/me').then(setMe) }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.new_password !== form.confirm) {
      setError('New passwords do not match.')
      return
    }
    if (form.new_password.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      await api('/api/me/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
      })
      setForm({ current_password: '', new_password: '', confirm: '' })
      showToast('Password updated successfully.')
    } catch (err) {
      setError(err?.message || 'Error updating password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Profile</div>
        <div className="page-subtitle">Account settings</div>
      </div>

      {me && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="profile-info">
            <div className="profile-avatar">{me.username[0].toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{me.username}</div>
              <div style={{ marginTop: 4 }}><Badge variant={me.role}>{me.role}</Badge></div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Change password</div>
        <form onSubmit={submit} className="form-stack">
          <div className="form-group">
            <label>Current password</label>
            <input type="password" placeholder="••••••••" value={form.current_password}
              onChange={e => setForm({ ...form, current_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>New password</label>
            <input type="password" placeholder="Min. 6 characters" value={form.new_password}
              onChange={e => setForm({ ...form, new_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input type="password" placeholder="Repeat new password" value={form.confirm}
              onChange={e => setForm({ ...form, confirm: e.target.value })} />
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <div>
            <button className="btn btn-primary"
              disabled={loading || !form.current_password || !form.new_password || !form.confirm}>
              {loading ? <><Spinner /> Updating…</> : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      <Route path="/login"        element={<Login />} />
      <Route path="/ask"          element={<RequireAuth><Ask /></RequireAuth>} />
      <Route path="/watchlist"    element={<RequireAuth><Watchlist /></RequireAuth>} />
      <Route path="/runs"         element={<RequireAuth><Runs /></RequireAuth>} />
      <Route path="/runs/:id"     element={<RequireAuth><RunDetail /></RequireAuth>} />
      <Route path="/admin/users"  element={<RequireAuth><AdminUsers /></RequireAuth>} />
      <Route path="/admin/stats"  element={<RequireAuth><AdminStats /></RequireAuth>} />
      <Route path="/profile"      element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="*"             element={<Navigate to="/ask" />} />
    </Routes>
  )
}
