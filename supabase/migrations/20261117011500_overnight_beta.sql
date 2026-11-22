-- Overnight beta data (PLAN.md B9). Prototype: RLS off on these tables.

create table if not exists public.agent_files (
  id bigint generated always as identity primary key,
  child_id text not null,
  name text not null check (name in ('persona', 'planner', 'brain', 'heartbeat', 'parent')),
  version int not null,
  content text not null,
  changed_by text,
  change_note text,
  created_at timestamptz not null default now(),
  unique (child_id, name, version)
);
create index if not exists agent_files_latest on public.agent_files (child_id, name, version desc);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  child_id text not null,
  sender text not null,
  sender_kind text not null check (sender_kind in ('parent', 'bot', 'system')),
  text text not null default '',
  audio_url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_child_created on public.messages (child_id, created_at desc);

create table if not exists public.turns (
  id bigint generated always as identity primary key,
  child_id text not null,
  session_id text,
  kind text not null default 'talk' check (kind in ('talk', 'job', 'call', 'song')),
  child_text text,
  nani_text text,
  cues jsonb not null default '[]'::jsonb,
  file_versions jsonb not null default '{}'::jsonb,
  timings jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists turns_child_created on public.turns (child_id, created_at desc);

-- Demo clock and presenter switches, one row per child.
create table if not exists public.demo_state (
  child_id text primary key,
  clock_offset_ms bigint not null default 0,
  show_timings boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.agent_files disable row level security;
alter table public.messages disable row level security;
alter table public.turns disable row level security;
alter table public.demo_state disable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.agent_files, public.messages, public.turns, public.demo_state to anon, authenticated;
grant all on public.agent_files, public.messages, public.turns, public.demo_state to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.messages replica identity full;
alter table public.agent_files replica identity full;
alter table public.turns replica identity full;
alter table public.demo_state replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'agent_files') then
    alter publication supabase_realtime add table public.agent_files;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'turns') then
    alter publication supabase_realtime add table public.turns;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'demo_state') then
    alter publication supabase_realtime add table public.demo_state;
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do update set public = true;
