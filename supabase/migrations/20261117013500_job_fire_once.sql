-- Each routine job fires once per due time (PLAN C10), even with several /toy tabs open.
create unique index if not exists turns_job_once
  on public.turns ((meta->>'jobKey'), (meta->>'dueAt'))
  where kind = 'job';
