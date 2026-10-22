// @vitest-environment node
import { it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

it('enforces owner isolation and atomic revision checks in PostgreSQL', async () => {
const db = new PGlite()
try {
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`)
const sql = readFileSync(new URL('../../../supabase/migrations/202610220001_fitness_state.sql', import.meta.url), 'utf8')
await db.exec(sql)
await db.exec(sql) // repeatable installation
const as = async n => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000${n}';`)
const query = async (sql, args=[]) => (await db.query(sql,args)).rows[0]?.result
await as(1)
assert.equal((await query('select public.fitness_get_state() as result')).state,null)
const doc={workouts:[{id:'workout-1'}],routines:[],active:{id:'local-only'},_ts:1234}
const first=await query('select public.fitness_put_state($1, null, null) as result',[doc])
assert.equal(first.rev,1)
let saved=await query('select public.fitness_get_state() as result')
assert.equal(saved.state.workouts[0].id,'workout-1'); assert.equal(saved.state.active,undefined)
let denied=false
try {await db.exec("update public.fitness_states set state='{}'")} catch {denied=true}
assert(denied,'direct writes must be denied')
await as(2)
assert.equal((await db.query('select * from public.fitness_states')).rows.length,0,'RLS hides other owners')
assert.equal((await query('select public.fitness_get_state() as result')).state,null)
await query('select public.fitness_put_state($1,null,null) as result',[{workouts:[{id:'owner-2'}]}])
await as(1)
assert.equal((await query('select public.fitness_get_state() as result')).state.workouts[0].id,'workout-1')
const next=await query('select public.fitness_put_state($1,$2,$3) as result',[{workouts:[{id:'new'}]},first.rev,first.wid])
assert.equal(next.rev,2)
const conflict=await query('select public.fitness_put_state($1,$2,$3) as result',[{workouts:[]},first.rev,first.wid])
assert.equal(conflict.conflict,true); assert.equal(conflict.state.workouts[0].id,'new')
const missingBase=await query('select public.fitness_put_state($1,null,null) as result',[{workouts:[]}])
assert.equal(missingBase.conflict,true)
let invalid=false
try {await query('select public.fitness_put_state($1,$2,$3) as result',[{workouts:'bad'},next.rev,next.wid])} catch {invalid=true}
assert(invalid,'invalid state must be refused')
await db.exec('reset role; set role anon;')
let anonymous=false
try {await query('select public.fitness_get_state() as result')} catch {anonymous=true}
assert(anonymous,'anonymous access must be refused')

} finally { await db.close() }
}, 30000)
