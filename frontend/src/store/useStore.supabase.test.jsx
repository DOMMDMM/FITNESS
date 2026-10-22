// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../lib/supabase-config.js', () => ({ SUPABASE: true, SUPABASE_URL: 'https://fitness.example.com' }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))
vi.mock('../lib/mobile.js', async importOriginal => ({
  ...await importOriginal(), MOBILE: true, initReminderSync: () => {}, syncReminder: () => {},
  nativeLoad: async () => null, nativeSave: async () => {}, readJsonFile: async () => null,
  writeJsonFile: async () => {}, onAppActive: () => () => {},
}))
vi.mock('../lib/remote.js', () => ({
  loadRemote: vi.fn(), chooseLocal: vi.fn(), forgetRemote: vi.fn(), connect: vi.fn(),
  normalizeServerUrl: vi.fn(), renewToken: vi.fn(),
}))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: () => {} }) } }))
import { api } from '../lib/api.js'
import { loadRemote } from '../lib/remote.js'
import { useStore, DEF } from './useStore.js'
const clone = v => JSON.parse(JSON.stringify(v))
const user = { id: 'fitness-owner', name: 'Atleta' }
beforeEach(() => {
  localStorage.clear(); api.mockReset(); loadRemote.mockReset()
  useStore.setState({ S: clone(DEF), user: null, ready: false })
})
it('boots the native build with account sync instead of local-only onboarding or pairing', async () => {
  api.mockImplementation(async (path, opts) => {
    if (path === '/api/config') return { allow_guest: false, default_lang: 'pt-BR' }
    if (path === '/api/me') return { user }
    if (path === '/api/data' && !opts) return { state: { ...clone(DEF), _ts: 10, workouts: [{ id: 'from-cloud', d: '2026-10-22', entries: [] }] }, rev: 1 }
    return { ok: true, rev: 2 }
  })
  await useStore.getState().boot()
  expect(loadRemote).not.toHaveBeenCalled()
  expect(useStore.getState()).toMatchObject({ user, ready: true, needsMobileOnboarding: false })
  expect(useStore.getState().S.workouts[0].id).toBe('from-cloud')
  expect(useStore.getState().sync.server).toBe('https://fitness.example.com')
  expect(useStore.getState().isGuest()).toBe(false)
})
it('preserves the signed-in native copy when cloud data cannot be reached', async () => {
  useStore.setState({ S: { ...clone(DEF), workouts: [{ id: 'offline-workout', d: '2026-10-22', entries: [] }] }, user })
  localStorage.setItem('gym_owner', user.id)
  api.mockImplementation(async path => {
    if (path === '/api/config') return { allow_guest: false }
    if (path === '/api/me') return { user }
    throw new TypeError('Failed to fetch')
  })
  await useStore.getState().boot()
  expect(useStore.getState().user).toEqual(user)
  expect(useStore.getState().S.workouts[0].id).toBe('offline-workout')
  expect(useStore.getState().ready).toBe(true)
  expect(useStore.getState().sync.offline).toBe(true)
})
