# Handoff · 2026-11-22 (after the Tutor Nani move)

## State
The software moved to the Tutor Nani project (GitHub, Vercel and Supabase), and the replica passed its side-by-side check against the old stack. Nani's brain is now Claude Haiku 5.5, with Kimi as the backup for each call. On Claude: the stage script passes 15 of 15, the median time to first audio is 2.45 s (Kimi: 3.18 s), and no call fell back to Kimi. The toy and the laptop bridge haven't moved yet; they are the next brief.
- Report: docs/thinking-partner/NOW.md
- The stage script: docs/thinking-partner/DEMO.md
- Questions for the founder: docs/thinking-partner/OPEN.md
- Earlier runs: docs/plan/RUNLOG.md, docs/plan/SELFTEST.md, docs/plan/REFINE.md

## Branches and PRs
None open. PR #1 (the Claude switch and the Kimi fallback) is merged.

## Running
- Production: https://tutor-nani.vercel.app with `/stage` (the demo), `/` (parents' chat), `/toy`, `/home-base`, `/presenter` and `/pitch.html`.
- Vercel: project tutor-nani, team hrizzup (`--scope hrizzup`), root apps/web, functions in bom1, Node 26. main deploys to production. Preview URLs redirect to the Vercel login.
- Brain: BRAIN_PROVIDER=claude (Production and Preview) overrides `brain.provider` ("kimi") in content/demo.config.json. To roll back: set it to kimi and redeploy. Each turn's `done.ms` and `turns.timings` say which brain answered (brainProvider, brainAttempt).
- Supabase: project Tutor Nani (ref cglximouqzxbnjhkhmzp), in the Tutor Grandma org, ap-south-1.
  - Tables: agent_files, messages, turns, demo_state and progress_days.
  - Migrations are in supabase/migrations. To push one, link a worktree to the project (`supabase link --project-ref cglximouqzxbnjhkhmzp`), then run `supabase db push --linked --yes -p "$SUPABASE_DB_PASSWORD"`.
- Old stack (the fallback, untouched): https://tutor-grandma.vercel.app. Its details are in the founder's handover folder, not in this repo. Don't change it.
- Seed and reset: `curl -X POST https://tutor-nani.vercel.app/api/reset` restores content/seed.json, content/progress-seed.json and the real clock, then warms up the brain, the voice and the database (`?warm=0` skips the warm-up).
- Self-test on production, one at a time:
  - `python3 -I scripts/selftest/selftest.py script --runs 4` (about 6 min on Claude; keeps a headless /toy open for reminders)
  - `python3 -I scripts/selftest/selftest.py bubbles`
  - `python3 -I scripts/selftest/selftest.py offscript`
- Routine tests: from apps/web, run `node_modules/.bin/tsc --outDir <tmp> --module commonjs --esModuleInterop --target es2022 --moduleResolution node --skipLibCheck --types node lib/routine/routine.test.ts && node --test <tmp>/routine/routine.test.js`.
- Contracts: docs/plan/CONTRACTS.md and docs/toy-contract.md. `done.ms` now also carries brainProvider and brainAttempt; both are optional.

## Next actions, in order
1. The hardware brief: point the toy and the laptop bridge at https://tutor-nani.vercel.app. docs/toy-contract.md:8 still names the old URL on purpose, until then.
2. Before any demo: run /preflight, then `selftest.py script --runs 1`, then reset.
3. The founder answers OPEN.md: the seed dates, the wait music, when to retire the old stack, and the stall cap on calls that don't stream.
4. Small polish: the stage's chat header title truncates at 1440×900, and replies sometimes run to 3 sentences.

## Gotchas
- After every squash-merge, run `git pull --ff-only` on local main, or the next S commit diverges.
- To wait for a deploy: `bash ~/Downloads/TutorNani-handover/ops/vercel-setup.sh deploy` waits on the production deployment of main, and `verify` checks it.
- Brain: never send temperature, either to Kimi k2.6 (its API fixes it) or to Claude Haiku 5.5 (it returns 400). Kimi stalls on some requests. brainStreamRetry runs one request at a time: Claude first, then Kimi. Never send parallel requests, because Kimi throttles bursts.
- Commit `pnpm-lock.yaml` with any package change, or Vercel's frozen install fails.
- Builders share the Playwright browser: tell them to open their own context.
- Only the Coordinator calls /api/reset while builders test, because it wipes the shared chat and turns.
- The self-test's `script`, `bubbles` and `offscript` modes append to docs/plan/SELFTEST.md; `all` overwrites it.
- CSS modules are broken by the turbopack `*.css` rule in next.config.ts. Use plain CSS files with prefixed class names (`toy-*`, `stg-*`).
- On /stage, the toy core feeds the wall through lib/wall-bus.ts. Never subscribe to wall:<child> twice on one page.
- GitHub blocks pushes that use the founder's private email; the repo config uses the noreply address.
- Never touch hrizzup-staging or anything in Zugzwang-world's Org in Supabase.
- If a key arrives in chat, write it to .env.local and never echo it. The repo is public.
