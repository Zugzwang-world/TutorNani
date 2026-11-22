# Handoff · 2026-11-19 (after the refinement run)

## State
The refinement run (docs/plan/REFINE.md) is done and live on production. /stage is the one-screen demo, tap to talk works on /stage and /toy, and the rest is merged too: idea bubbles, agent profiles, the game inside anything, the progress report, wait music, and reminders on the real clock. The script check passes on production (4 runs, every step in at least 3 of 4). Latency (2.4–2.7 s to the first sentence) and the off-script round (24–27 of 30) fall short.
- Report: docs/thinking-partner/NOW.md
- The stage script: docs/thinking-partner/DEMO.md
- Questions for the founder: docs/thinking-partner/OPEN.md
- Run log: docs/plan/RUNLOG.md ("Refinement run"). Self-test results: docs/plan/SELFTEST.md. Plan: docs/plan/REFINE.md.

## Branches and PRs
None open. PRs #17 to #24 are merged.

## Running
- Production: https://tutor-nani.vercel.app with `/stage` (the demo), `/` (parents' chat), `/toy`, `/home-base`, `/presenter` and `/pitch.html`.
- Vercel: project tutor-nani, team hrizzup (`--scope hrizzup`), root apps/web, functions in bom1. main deploys to production; preview URLs return 401.
- Supabase: project Tutor Nani (ref cglximouqzxbnjhkhmzp). Tables agent_files, messages, turns, demo_state and progress_days. Migrations are in supabase/migrations; to push one, copy supabase/.temp from the main checkout into a worktree, then `supabase db push --linked --yes -p "$SUPABASE_DB_PASSWORD"`.
- Seed and reset: `curl -X POST https://tutor-nani.vercel.app/api/reset` restores content/seed.json and content/progress-seed.json and the real clock, then warms up the brain, the voice and the database (`?warm=0` skips the warm-up).
- Self-test on production, one at a time:
  - `python3 -I scripts/selftest/selftest.py script --runs 4` (about 9 min; keeps a headless /toy open for reminders)
  - `python3 -I scripts/selftest/selftest.py bubbles`
  - `python3 -I scripts/selftest/selftest.py offscript`
- Routine tests: from apps/web, `node_modules/.bin/tsc --outDir <tmp> --module commonjs --esModuleInterop --target es2022 --moduleResolution node --skipLibCheck --types node lib/routine/routine.test.ts && node --test <tmp>/routine/routine.test.js`.
- Contracts: docs/plan/CONTRACTS.md ("Refinement run contracts": job lines, markers, bubbles, progress data, stage seams, reset) and docs/toy-contract.md.

## Next actions, in order
1. Founder: answer OPEN.md ("From the refinement run"): latency and the brain switch, listening to the wait music, and the demo-day seed dates.
2. Before any demo: run /preflight, then `selftest.py script --runs 1`, then reset.
3. If the brain moves to Claude: fix the Claude path in lib/brain.ts first (thinking disabled, low effort), then measure end to end.
4. Small polish: the stage's chat header title truncates at 1440×900; replies sometimes run to 3 sentences.

## Gotchas
- After every squash-merge, run `git pull --ff-only` on local main, or the next S commit diverges.
- To wait for a deploy: `gh api repos/Zugzwang-world/TutorNani/commits/<sha>/status --jq .state` until it says `success`.
- Kimi k2.6: never send temperature. It stalls on some requests; /api/turn and the sorter cancel and retry one at a time (`brainStreamRetry`). Never send parallel requests: Kimi throttles bursts.
- Commit `pnpm-lock.yaml` with any package change, or Vercel's frozen install fails.
- Builders share the Playwright browser: tell them to open their own context.
- Only the Coordinator calls /api/reset while builders test: it wipes the shared chat and turns.
- The self-test's `script`, `bubbles` and `offscript` modes append to docs/plan/SELFTEST.md; `all` overwrites it.
- CSS modules are broken by the turbopack `*.css` rule in next.config.ts: use plain CSS files with prefixed class names (`toy-*`, `stg-*`).
- On /stage the toy core feeds the wall through lib/wall-bus.ts. Never subscribe to wall:<child> twice on one page.
- GitHub blocks pushes that use the founder's private email; the repo config uses the noreply address.
- Never touch hrizzup-staging or anything in Zugzwang-world's Org in Supabase.
- If a key arrives in chat, write it to .env.local and never echo it. The repo is public.
