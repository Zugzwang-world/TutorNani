# BUILDERS · rules for every overnight task

1. **Start from fresh main.** In your worktree: `git fetch origin && git checkout -B <your-branch> origin/main`.
2. **Env:** `cp /Users/hrishikesh/TutorNani/.env.local apps/web/.env.local` (gitignored; values may be quoted), then `pnpm install` at the repo root. Never print, log or commit a key: the repo is public.
3. **Read first:** `docs/plan/CONTRACTS.md` (all of it), the part of the plan your task names, and `apps/web/AGENTS.md` plus the matching guide in `apps/web/node_modules/next/dist/docs/` before writing Next.js code (Next 16.4.6, cacheComponents on).
4. **Stay in your folders.** Do not edit the shared layer (`apps/web/lib/*.ts`, `lib/supabase/*`), `app/layout.tsx`, `app/globals.css`, `content/demo.config.json`, `content/seed.json`, `package.json` or the lockfile. **No new dependencies.** If you need a shared change, say so in your report; the Coordinator makes it.
5. **Dev server on your own port:** `pnpm --filter web dev --port <your port>`.
6. **Supabase is shared with production.** Never call `/api/reset` and never delete rows you did not create. Test rows are fine; the Coordinator resets after merging.
7. **Founder is asleep.** Never ask questions. Pick the simplest option that works on stage, and note it in the PR.
8. **Before the PR:** `pnpm --filter web build` passes, plus one quick check that proves the feature works. Preview URLs return 401, so test locally.
9. **PR:** `gh pr create --base main`. Three-line description: what changed, how to see it, anything left. End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not merge; the Coordinator merges.
10. **Report in five lines or fewer:** the PR URL, what works, what you measured, anything left.
11. **Time box:** about 75 minutes for M tasks and 100 for L. If you are running long, ship the core and list the rest in the PR.
