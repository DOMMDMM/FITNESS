import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js'
import { MOBILE } from './mobile.js'

// Authentication is a device fact: never put it in workout state or exported backups.
const storage = MOBILE ? {
  async getItem(key) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    return await SecureStorage.get(key) ?? null
  },
  async setItem(key, value) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    await SecureStorage.set(key, value)
  },
  async removeItem(key) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    await SecureStorage.remove(key)
  },
} : undefined

let client
export function supabaseClient() {
  return client ||= createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { fetch: async (url, init = {}) => {
      const controller = new AbortController()
      const abort = () => controller.abort()
      if (init.signal?.aborted) abort()
      init.signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, 30000)
      try { return await fetch(url, { ...init, signal: controller.signal }) }
      finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort) }
    } },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !MOBILE,
      storageKey: 'alter-ego-auth', ...(storage ? { storage } : {}) },
  })
}
export const profileOf = user => user ? {
  id: user.id, name: user.user_metadata?.name || user.email?.split('@')[0] || 'Atleta',
  email: user.email, created: user.created_at,
} : null

function fail(message, status, data) {
  return Object.assign(new Error(message), { status, data })
}

// Translate the workout API contract, retaining the existing offline queue/merge logic.
// Unsupported upstream services fail explicitly; they never report an upload as saved.
export async function supabaseApi(path, opts = {}, client = supabaseClient()) {
  const method = (opts.method || 'GET').toUpperCase()
  if (path === '/api/config') return {
    allow_guest: false, password_login: false, default_lang: 'pt-BR',
    media: { workouts: false },
  }
  if (path === '/api/me') {
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    if (!data.session) throw fail('Entre na sua conta para sincronizar.', 401)
    // Session restoration works offline; actual database requests still validate the JWT.
    return { user: profileOf(data.session.user) }
  }
  if (path === '/api/logout' || path === '/api/logout/all') {
    const { error } = await client.auth.signOut({ scope: path.endsWith('/all') ? 'global' : 'local' })
    if (error) throw error
    return { ok: true }
  }
  if (path === '/api/data' || path === '/api/data/rev') {
    const body = opts.body ? JSON.parse(opts.body) : {}
    const write = method === 'PUT' && path === '/api/data'
    if (method !== 'GET' && !write) throw fail('Operação não suportada.', 405)
    const { data, error } = await client.rpc(write ? 'fitness_put_state' : 'fitness_get_state', write ? {
      p_state: body.state, p_base_rev: body.baseRev ?? null, p_base_wid: body.baseWid ?? null,
    } : {})
    if (error) throw fail(error.message,
      ['42501', 'PGRST301', 'PGRST303'].includes(error.code) ? 401 : error.code ? 503 : undefined,
      { code: error.code })
    if (data?.conflict) throw fail('Outro dispositivo sincronizou. Conciliando alterações.', 409, data)
    return path.endsWith('/rev') ? { rev: data.rev, wid: data.wid } : data
  }
  throw fail('Este recurso do openGym ainda não está disponível no Alter Ego com Supabase.', 501)
}
