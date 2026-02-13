import React, { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

const api = async (path, options = {}) => {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    return
  }
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

function Layout({ children }) {
  return (
    <div className="app">
      <nav>
        <Link to="/ask">Ask</Link>
        <Link to="/watchlist">Watchlist</Link>
        <Link to="/runs">Runs</Link>
        <Link to="/admin/users">Admin Users</Link>
      </nav>
      <main>{children}</main>
    </div>
  )
}

function Login() {
  const nav = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const submit = async (e) => {
    e.preventDefault()
    const out = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
    if (out?.access_token) {
      localStorage.setItem('token', out.access_token)
      nav('/ask')
    }
  }
  return <form onSubmit={submit}><h2>Login</h2><input value={username} onChange={(e)=>setUsername(e.target.value)} /><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} /><button>Login</button></form>
}

function Ask() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    const out = await api('/api/ask', { method: 'POST', body: JSON.stringify({ query, recency_days: 7, max_results: 5, domains_allow: [], domains_block: [] }) })
    setResult(out)
  }
  return <Layout><form onSubmit={submit}><h2>Ask</h2><textarea value={query} onChange={(e)=>setQuery(e.target.value)} /><button>Run</button></form><pre>{result?.digest_md}</pre></Layout>
}

function Watchlist() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({name:'', query:'', cron:'*/10 * * * *', recency_days:7, max_results:5, domains_allow:'', domains_block:''})
  const load = async () => setItems(await api('/api/watchlist') || [])
  useEffect(()=>{load()},[])
  const create = async (e) => {
    e.preventDefault()
    await api('/api/watchlist/personal', { method:'POST', body: JSON.stringify({...form, domains_allow: form.domains_allow.split(',').map(s=>s.trim()).filter(Boolean), domains_block: form.domains_block.split(',').map(s=>s.trim()).filter(Boolean), enabled:true})})
    load()
  }
  const runNow = async (id) => { await api(`/api/watchlist/${id}/run`, {method:'POST'}); load() }
  return <Layout><h2>Watchlist</h2><form onSubmit={create}><input placeholder='name' value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/><input placeholder='query' value={form.query} onChange={(e)=>setForm({...form,query:e.target.value})}/><input placeholder='cron' value={form.cron} onChange={(e)=>setForm({...form,cron:e.target.value})}/><button>Create personal</button></form>{items.map(i=><div key={i.id}><b>{i.name}</b> ({i.scope}) {i.cron} <button onClick={()=>runNow(i.id)}>Run now</button></div>)}</Layout>
}

function Runs() {
  const [runs, setRuns] = useState([])
  useEffect(()=>{api('/api/runs').then(setRuns)},[])
  return <Layout><h2>Runs</h2>{runs.map(r=><div key={r.id}>#{r.id} {r.query}</div>)}</Layout>
}

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({username:'', password:'', role:'user'})
  const load = async () => setUsers(await api('/api/admin/users') || [])
  useEffect(()=>{load()},[])
  const create = async (e) => {
    e.preventDefault()
    await api('/api/admin/users', {method:'POST', body: JSON.stringify(form)})
    load()
  }
  return <Layout><h2>Admin Users</h2><form onSubmit={create}><input placeholder='username' value={form.username} onChange={(e)=>setForm({...form,username:e.target.value})}/><input placeholder='password' value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})}/><select value={form.role} onChange={(e)=>setForm({...form,role:e.target.value})}><option value='user'>user</option><option value='admin'>admin</option></select><button>Create</button></form>{users.map(u=><div key={u.id}>{u.username} ({u.role}) active={String(u.is_active)}</div>)}</Layout>
}

function RequireAuth({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/ask" element={<RequireAuth><Ask /></RequireAuth>} />
      <Route path="/watchlist" element={<RequireAuth><Watchlist /></RequireAuth>} />
      <Route path="/runs" element={<RequireAuth><Runs /></RequireAuth>} />
      <Route path="/admin/users" element={<RequireAuth><AdminUsers /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/ask" />} />
    </Routes>
  )
}
