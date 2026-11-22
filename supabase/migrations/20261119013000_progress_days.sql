-- Progress report (REFINE R7.2): one row per child per day. `data` follows ProgressDayData in apps/web/lib/types.ts.
-- Past days come from content/progress-seed.json (restored by /api/reset); today is built live by /api/progress.
create table if not exists public.progress_days (
  child_id text not null,
  day date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (child_id, day)
);

alter table public.progress_days disable row level security;
grant select on public.progress_days to anon, authenticated;
grant all on public.progress_days to service_role;
