-- TOUR brief (A): each child fires each job once per due time. The old index keyed on (jobKey, dueAt) only, so two
-- tour sandboxes (or a sandbox and aarav) firing the same job in the same slot deduped each other.
drop index if exists public.turns_job_once;
create unique index if not exists turns_job_once
  on public.turns (child_id, (meta->>'jobKey'), (meta->>'dueAt'))
  where kind = 'job';
