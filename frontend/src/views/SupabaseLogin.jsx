import { useState } from 'react'
import { supabaseClient, profileOf } from '../lib/supabase.js'
import { useStore } from '../store/useStore.js'
import { askAddDeviceData } from '../sheets.jsx'

export default function SupabaseLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signIn(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const { data, error } = await supabaseClient().auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      const store = useStore.getState()
      store.setUser(profileOf(data.user), { adopt: true })
      await store.adoptProfile(askAddDeviceData)
    } catch (e) {
      setError(e.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : e.message)
    } finally { setBusy(false) }
  }
  return <main className="narrow" style={{ paddingTop: '15vh', paddingBottom: 40 }}>
    <h1>Alter Ego</h1>
    <p>Sua próxima versão, uma repetição por vez.</p>
    <form onSubmit={signIn} style={{ display: 'grid', gap: 14 }}>
      <label>E-mail<input className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Senha<input className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Entrar'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
    <p className="muted small">Use a conta criada para você no Alter Ego. Após entrar, seus treinos ficam disponíveis offline e sincronizam quando a conexão voltar.</p>
  </main>
}
