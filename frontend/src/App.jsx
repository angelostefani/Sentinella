import React, { useEffect, useState } from 'react'
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
    throw new Error('Sessione scaduta. Effettua di nuovo il login.')
  }
  const text = await res.text()
  let data = {}
  if (text) {
    try { data = JSON.parse(text) }
    catch { data = { detail: text } }
  }
  if (!res.ok) throw new Error(data?.detail || `Richiesta fallita (${res.status})`)
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
      { to: '/admin/stats', label: 'Statistiche', icon: '📊' },
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
            <span>⚙</span> Profilo
          </Link>
          <button className="btn-logout" onClick={logout}>
            <span>⏻</span> Logout
          </button>
        </div>
      </aside>

      <main>{children}</main>
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
      setError(err?.message || 'Credenziali non valide')
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
            {loading ? <><Spinner /> Accesso in corso…</> : 'Accedi'}
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
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true); setResult(null)
    try {
      const out = await api('/api/ask', {
        method: 'POST',
        body: JSON.stringify({ query, recency_days: 7, max_results: 5, domains_allow: [], domains_block: [], output_language: language }),
      })
      setResult(out)
    } catch (err) {
      setError(err?.message || 'Errore durante la ricerca')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Ask</div>
        <div className="page-subtitle">Ricerca web immediata con digest AI</div>
      </div>

      <div className="card">
        <form onSubmit={submit} className="form-stack">
          <div className="form-group">
            <label>Query</label>
            <textarea rows={3} placeholder="Es. qdrant release changelog, novità kubernetes 1.30…"
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div className="form-group" style={{ maxWidth: 220 }}>
            <label>Lingua output</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <div>
            <button className="btn btn-primary" disabled={loading || !query.trim()}>
              {loading ? <><Spinner /> Elaborazione…</> : '🔍 Esegui ricerca'}
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
              ⬇ Scarica .md
            </button>
          </div>
          <MarkdownView content={result.digest_md} />
        </>
      )}
    </Layout>
  )
}

// ─── CronPicker ───────────────────────────────────────────────────────────────

const DAYS_LABELS = ['D', 'L', 'M', 'X', 'G', 'V', 'S']

function parseCron(cron) {
  const hourlyMatch = cron.match(/^0 \*\/(\d+) \* \* \*$/)
  if (hourlyMatch) return { mode: 'oraria', hours: Number(hourlyMatch[1]), time: '08:00', days: [1], raw: cron }
  const dailyMatch = cron.match(/^(\d+) (\d+) \* \* \*$/)
  if (dailyMatch) return { mode: 'giornaliera', hours: 6, time: `${dailyMatch[2].padStart(2,'0')}:${dailyMatch[1].padStart(2,'0')}`, days: [1], raw: cron }
  const weeklyMatch = cron.match(/^(\d+) (\d+) \* \* ([\d,]+)$/)
  if (weeklyMatch) return { mode: 'settimanale', hours: 6, time: `${weeklyMatch[2].padStart(2,'0')}:${weeklyMatch[1].padStart(2,'0')}`, days: weeklyMatch[3].split(',').map(Number), raw: cron }
  return { mode: 'avanzato', hours: 6, time: '08:00', days: [1], raw: cron }
}

function buildCron({ mode, hours, time, days, raw }) {
  const [hh, mm] = (time || '08:00').split(':').map(Number)
  if (mode === 'oraria')      return `0 */${hours} * * *`
  if (mode === 'giornaliera') return `${mm} ${hh} * * *`
  if (mode === 'settimanale') return `${mm} ${hh} * * ${[...days].sort((a,b)=>a-b).join(',')}`
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
        <option value="oraria">Oraria</option>
        <option value="giornaliera">Giornaliera</option>
        <option value="settimanale">Settimanale</option>
        <option value="avanzato">Avanzato</option>
      </select>

      {state.mode === 'oraria' && (
        <span className="cron-inline">
          ogni&nbsp;
          <input type="number" min="1" max="23" value={state.hours}
            onChange={e => update({ hours: Math.max(1, Math.min(23, Number(e.target.value))) })} />
          &nbsp;ore
        </span>
      )}

      {(state.mode === 'giornaliera') && (
        <span className="cron-inline">
          alle&nbsp;
          <input type="time" value={state.time} onChange={e => update({ time: e.target.value })} />
        </span>
      )}

      {state.mode === 'settimanale' && (
        <span className="cron-inline">
          {DAYS_LABELS.map((label, i) => (
            <button key={i} type="button"
              className={`day-btn${state.days.includes(i) ? ' active' : ''}`}
              onClick={() => toggleDay(i)}>{label}</button>
          ))}
          &nbsp;alle&nbsp;
          <input type="time" value={state.time} onChange={e => update({ time: e.target.value })} />
        </span>
      )}

      {state.mode === 'avanzato' && (
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
  tags: '', output_language: 'italiano',
}

function Watchlist() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => setItems(await api('/api/watchlist') || [])
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      await api('/api/watchlist/personal', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          recency_days: Number(form.recency_days),
          max_results: Number(form.max_results),
          domains_allow: form.domains_allow.split(',').map(s => s.trim()).filter(Boolean),
          domains_block: form.domains_block.split(',').map(s => s.trim()).filter(Boolean),
          tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
          enabled: true,
        }),
      })
      setForm(defaultForm)
      setSuccess('Watchlist creata con successo.')
      load()
    } catch (err) {
      setError(err?.message || 'Errore durante la creazione')
    } finally {
      setLoading(false)
    }
  }

  const runNow = async (id) => {
    setRunning(id)
    try { await api(`/api/watchlist/${id}/run`, { method: 'POST' }); load() }
    catch (err) { setError(err?.message || 'Errore nel run') }
    finally { setRunning(null) }
  }

  const deleteWatch = async (item) => {
    if (!confirm(`Eliminare "${item.name}" e tutti i suoi run?\nL'operazione non è reversibile.`)) return
    const path = item.scope === 'global'
      ? `/api/watchlist/global/${item.id}`
      : `/api/watchlist/personal/${item.id}`
    try {
      await api(path, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err?.message || 'Errore eliminazione')
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
      setError(err?.message || 'Errore')
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Watchlist</div>
        <div className="page-subtitle">Ricerche schedulate e monitoraggio continuo</div>
      </div>

      <div className="card">
        <div className="card-title">Nuova watchlist personale</div>
        <form onSubmit={create} className="form-stack">
          <div className="form-row">
            <div className="form-group">
              <label>Nome</label>
              <input placeholder="Es. Qdrant updates" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Frequenza</label>
              <CronPicker value={form.cron} onChange={cron => setForm({ ...form, cron })} />
            </div>
          </div>
          <div className="form-group">
            <label>Query</label>
            <input placeholder="Es. qdrant release changelog" value={form.query}
              onChange={e => setForm({ ...form, query: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Recency days</label>
              <input type="number" min={1} value={form.recency_days}
                onChange={e => setForm({ ...form, recency_days: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Max results</label>
              <input type="number" min={1} max={20} value={form.max_results}
                onChange={e => setForm({ ...form, max_results: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Domini consentiti (virgola)</label>
              <input placeholder="github.com, qdrant.tech" value={form.domains_allow}
                onChange={e => setForm({ ...form, domains_allow: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Domini bloccati (virgola)</label>
              <input placeholder="spam.com" value={form.domains_block}
                onChange={e => setForm({ ...form, domains_block: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tag (virgola)</label>
              <input placeholder="tech, ai, monitoring" value={form.tags}
                onChange={e => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Lingua output</label>
              <select value={form.output_language}
                onChange={e => setForm({ ...form, output_language: e.target.value })}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          {error  && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}
          <div>
            <button className="btn btn-primary" disabled={loading || !form.name || !form.query}>
              {loading ? <><Spinner /> Creazione…</> : '+ Crea watchlist'}
            </button>
          </div>
        </form>
      </div>

      <div className="watch-list">
        {items.length === 0 && <EmptyState icon="👁" text="Nessuna watchlist trovata." />}
        {items.map(item => (
          <div className="watch-item" key={item.id}>
            <div className="watch-item-info">
              <div className="watch-item-name">{item.name}</div>
              <div className="watch-item-meta">
                <Badge variant={item.scope}>{item.scope}</Badge>
                <span className="watch-item-cron">{item.cron}</span>
                <Badge variant="user">{item.output_language}</Badge>
                {!item.enabled && <Badge variant="inactive">disabled</Badge>}
              </div>
              <TagList tags={item.tags} />
            </div>
            <button
              className={`btn btn-sm ${item.enabled ? 'btn-danger' : 'btn-secondary'}`}
              title={item.enabled ? 'Ferma schedulazione' : 'Riprendi schedulazione'}
              onClick={() => toggle(item)}
            >
              {item.enabled ? '⏸ Pausa' : '▶ Riprendi'}
            </button>
            <button className="btn btn-secondary btn-sm"
              disabled={running === item.id} onClick={() => runNow(item.id)}>
              {running === item.id ? <Spinner /> : '▶ Run now'}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => deleteWatch(item)}
              title="Elimina watchlist">
              🗑
            </button>
          </div>
        ))}
      </div>
    </Layout>
  )
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

function Runs() {
  const [runs, setRuns] = useState([])
  const [filter, setFilter] = useState('')
  const [downloading, setDownloading] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    api('/api/runs').then(data => setRuns(data || []))
  }, [])

  const filtered = runs.filter(r =>
    !filter || r.query.toLowerCase().includes(filter.toLowerCase())
  )

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
    if (!confirm(`Eliminare il run #${r.id} "${r.query}"?`)) return
    await api(`/api/runs/${r.id}`, { method: 'DELETE' })
    setRuns(prev => prev.filter(x => x.id !== r.id))
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Runs</div>
        <div className="page-subtitle">Storico delle esecuzioni</div>
      </div>

      <div className="filter-bar">
        <input placeholder="🔍 Cerca per query…" value={filter}
          onChange={e => setFilter(e.target.value)} />
      </div>

      <div className="runs-list">
        {filtered.length === 0 && (
          <EmptyState icon="📋" text={filter ? 'Nessun risultato per questa ricerca.' : 'Nessun run trovato.'} />
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
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/runs/${id}`)
      .then(setRun)
      .catch(err => setError(err?.message || 'Errore'))
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
            <button className="btn btn-secondary btn-sm"
              onClick={() => downloadMd(run.digest_md, run.query)}>
              ⬇ Scarica .md
            </button>
          </div>

          <MarkdownView content={run.digest_md} />

          {run.items && run.items.length > 0 && (
            <>
              <div className="divider" />
              <div className="card-title" style={{ marginTop: 4 }}>Fonti ({run.items.length})</div>
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
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => setUsers(await api('/api/admin/users') || [])
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) })
      setForm({ username: '', password: '', role: 'user' })
      setSuccess(`Utente "${form.username}" creato.`)
      load()
    } catch (err) {
      setError(err?.message || 'Errore durante la creazione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Admin Users</div>
        <div className="page-subtitle">Gestione utenti e ruoli</div>
      </div>

      <div className="card">
        <div className="card-title">Crea nuovo utente</div>
        <form onSubmit={create} className="form-stack">
          <div className="form-row">
            <div className="form-group">
              <label>Username</label>
              <input placeholder="mario.rossi" value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Ruolo</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" placeholder="Password iniziale" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          {error   && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}
          <div>
            <button className="btn btn-primary" disabled={loading || !form.username || !form.password}>
              {loading ? <><Spinner /> Creazione…</> : '+ Crea utente'}
            </button>
          </div>
        </form>
      </div>

      <div className="users-list">
        {users.length === 0 && <EmptyState icon="👤" text="Nessun utente trovato." />}
        {users.map(u => (
          <div className="user-item" key={u.id}>
            <div className="user-avatar">{u.username[0].toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{u.username}</div>
              <div className="user-meta">
                <Badge variant={u.role}>{u.role}</Badge>
                <Badge variant={u.is_active ? 'active' : 'inactive'}>
                  {u.is_active ? 'attivo' : 'disattivato'}
                </Badge>
              </div>
            </div>
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
      .catch(err => setError(err?.message || 'Errore'))
      .finally(() => setLoading(false))
  }, [])

  const maxCount = stats ? Math.max(...stats.runs_per_day.map(r => r.count), 1) : 1

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Statistiche</div>
        <div className="page-subtitle">Overview dell'attività della piattaforma</div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>}
      {error && <Alert type="error">{error}</Alert>}

      {stats && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Utenti</div>
              <div className="stat-value">{stats.total_users}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Watchlist</div>
              <div className="stat-value">{stats.total_watches}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Run totali</div>
              <div className="stat-value">{stats.total_runs}</div>
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">Run per giorno (ultimi 14 giorni)</div>
            {stats.runs_per_day.length === 0 ? (
              <EmptyState icon="📊" text="Nessun run negli ultimi 14 giorni." />
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
            <div className="card-title">Watchlist più attive</div>
            <div className="top-watches-list">
              {stats.top_watches.length === 0 && (
                <EmptyState icon="👁" text="Nessuna watchlist con run." />
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
  const [success, setSuccess] = useState('')

  useEffect(() => { api('/api/me').then(setMe) }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (form.new_password !== form.confirm) {
      setError('Le nuove password non coincidono.')
      return
    }
    if (form.new_password.length < 6) {
      setError('La nuova password deve essere di almeno 6 caratteri.')
      return
    }
    setLoading(true)
    try {
      await api('/api/me/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
      })
      setForm({ current_password: '', new_password: '', confirm: '' })
      setSuccess('Password aggiornata con successo.')
    } catch (err) {
      setError(err?.message || 'Errore durante l\'aggiornamento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-title">Profilo</div>
        <div className="page-subtitle">Impostazioni account</div>
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
        <div className="card-title">Cambia password</div>
        <form onSubmit={submit} className="form-stack">
          <div className="form-group">
            <label>Password corrente</label>
            <input type="password" placeholder="••••••••" value={form.current_password}
              onChange={e => setForm({ ...form, current_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Nuova password</label>
            <input type="password" placeholder="Min. 6 caratteri" value={form.new_password}
              onChange={e => setForm({ ...form, new_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Conferma nuova password</label>
            <input type="password" placeholder="Ripeti la nuova password" value={form.confirm}
              onChange={e => setForm({ ...form, confirm: e.target.value })} />
          </div>
          {error   && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}
          <div>
            <button className="btn btn-primary"
              disabled={loading || !form.current_password || !form.new_password || !form.confirm}>
              {loading ? <><Spinner /> Aggiornamento…</> : 'Aggiorna password'}
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
