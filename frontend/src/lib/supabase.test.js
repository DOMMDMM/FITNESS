import { describe, it, expect, vi } from 'vitest'
import { supabaseApi, profileOf } from './supabase.js'

const client = () => ({ rpc: vi.fn(), auth: { getSession: vi.fn(), signOut: vi.fn() } })
describe('Alter Ego Supabase API', () => {
  it('restores the authenticated profile without requiring network for offline startup', async () => {
    const c = client()
    c.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner', email: 'athlete@example.com', user_metadata: { name: 'Atleta' } } } } })
    expect((await supabaseApi('/api/me', {}, c)).user).toMatchObject({ id: 'owner', name: 'Atleta' })
    expect(c.rpc).not.toHaveBeenCalled()
  })
  it('refuses an unauthenticated startup', async () => {
    const c = client(); c.auth.getSession.mockResolvedValue({ data: { session: null } })
    await expect(supabaseApi('/api/me', {}, c)).rejects.toMatchObject({ status: 401 })
  })
  it('sends the revision and write ID to the atomic RPC and never accepts a caller-specified owner', async () => {
    const c = client(); c.rpc.mockResolvedValue({ data: { ok: true, rev: 4, wid: 'new' } })
    const body = { state: { workouts: [] }, baseRev: 3, baseWid: 'old', user_id: 'someone-else' }
    expect(await supabaseApi('/api/data', { method: 'PUT', body: JSON.stringify(body) }, c)).toMatchObject({ rev: 4 })
    expect(c.rpc).toHaveBeenCalledWith('fitness_put_state', { p_state: body.state, p_base_rev: 3, p_base_wid: 'old' })
  })
  it('preserves conflict state for the existing offline merge/retry logic', async () => {
    const c = client(); const state = { workouts: [{ id: 'other-device' }] }
    c.rpc.mockResolvedValue({ data: { conflict: true, state, rev: 8, wid: 'other' } })
    await expect(supabaseApi('/api/data', { method: 'PUT', body: '{}' }, c)).rejects.toMatchObject({ status: 409, data: { state, rev: 8 } })
  })
  it('reports unavailable tables as a failure instead of confirming unsaved changes', async () => {
    const c = client(); c.rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Function not found' } })
    await expect(supabaseApi('/api/data', {}, c)).rejects.toMatchObject({ status: 503 })
  })
  it('returns only revision markers on a lightweight poll', async () => {
    const c = client(); c.rpc.mockResolvedValue({ data: { state: { workouts: [] }, rev: 3, wid: 'write' } })
    expect(await supabaseApi('/api/data/rev', {}, c)).toEqual({ rev: 3, wid: 'write' })
  })
  it('does not silently enable unimplemented upload or pairing services', async () => {
    await expect(supabaseApi('/api/pair/create', {}, client())).rejects.toMatchObject({ status: 501 })
    await expect(supabaseApi('/api/media/missing', {}, client())).rejects.toMatchObject({ status: 501 })
  })
  it('signs out locally or globally as requested', async () => {
    const c = client(); c.auth.signOut.mockResolvedValue({ error: null })
    await supabaseApi('/api/logout', {}, c)
    expect(c.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
    await supabaseApi('/api/logout/all', {}, c)
    expect(c.auth.signOut).toHaveBeenLastCalledWith({ scope: 'global' })
  })
  it('derives a name without exposing authentication tokens', () => {
    expect(profileOf({ id: 'a', email: 'athlete@example.com', access_token: 'secret' })).toMatchObject({ id: 'a', name: 'athlete' })
    expect(profileOf(null)).toBeNull()
  })
})
