# Tutor Grandma: how we work

## The product
A plush toy for Indian children aged 5 to 8. The child squeezes its paw and talks; it answers in grandma's cloned voice. A projector home base shows animals on the wall. A parent website gives guidance and a nightly summary. One agent per child, with five files: persona.md, brain.md, planner.md, heartbeat.md, parent.md.
Buildathon prototype. Priorities, in order: low latency, high impact, demo reliability. No security hardening, auth, compliance or production checks.

## Stack so far
- Voice: ElevenLabs. Scribe v3 for hearing (audio events tagged, so a roar counts as a sound), Eleven v4 Turbo for live speech, Eleven v4 for pre-made lines, sound effects v3 and music v2.5 for the sounds and the song. Nani's voice is a library stand-in ("Dulari Didi") until grandma's clone arrives. Model ids and the voice live in content/demo.config.json.
- Live brain: Claude Haiku 5.5 (claude-haiku-5-5), called through @anthropic-ai/sdk with streaming, thinking disabled, effort low, no temperature (Haiku 5.5 rejects it) and maxRetries 0.
  - The switch is the env var BRAIN_PROVIDER, set to claude in Vercel for Production and Preview. It overrides `brain.provider` in content/demo.config.json, which stays "kimi" as the default.
  - Kimi (kimi-k2.6, thinking off, no temperature) is the backup for each call. A Claude call that errors, refuses, comes back empty or sends no first token within the caller's retry window runs on Kimi instead. lib/brain.ts tags every call with brainProvider and brainAttempt.
  - To roll back, set BRAIN_PROVIDER=kimi in Vercel and redeploy; env changes apply only to new deployments.
  - Code reads provider and model from the switch, never hard-coded.
  - Kimi stalls on some requests: cancel and retry one at a time, never parallel requests.
  - Grandma fillers cover every wait.
- Indian languages: ElevenLabs covers them for now. Sarvam is deferred to the buildathon day: do not build it. Nani writes Hindi in Roman letters.
- Web: Next.js 16 on Vercel, functions in bom1 (Mumbai). `/` parents' group chat, `/toy` toy stand-in, `/home-base` projector wall, `/presenter` hidden controls. Shared code in apps/web/lib; contracts in docs/plan/CONTRACTS.md.
- Supabase, kept light: four tables (agent_files, messages, turns, demo_state), one public bucket `audio`, and Realtime (postgres_changes plus the broadcast channels toy:, wall: and chat:). RLS is off for the prototype.
- Toy: ESP32-S3 running a fork of the ElatoAI firmware. Hardware and firmware are a separate track: do not build them until a hardware brief arrives. Software runs end to end without the toy; the hardware builds against docs/toy-contract.md. No Fly.io.
- All demo content lives in content/: demo.config.json (settings), seed.json (seed files and chat, restored by /api/reset), audio.json (pre-made audio). Never hard-code it.

## Who does what
- Founder: decides, speaks by voice, does physical steps. Not a coder.
- Thinking partner (claude.ai Project): plans, writes step briefs, reads docs/thinking-partner/ through GitHub sync.
- You, the Coordinator: everything else. Code, GitHub, Vercel, Supabase, docs. You are the only one who merges and deploys.

## First line of every reply
Size S, M or L · Who: coordinator, builder, expert or scout (plus reviewer if used) · Model and effort

## Size every task before acting
- S: one obvious change. A few lines, a config value, a command, a doc edit, a lookup. Do it yourself, commit to main, reply in 1 to 3 lines. No subagents, no new tests, no refactors, no extra docs.
- M: one feature in one area. One builder in a worktree, a PR, you merge.
- L: several areas, or a risky change on the demo path. Consult the advisor for the plan, run builders and the expert in parallel worktrees, use the reviewer on the demo-critical part only.
- Never raise a task's size without asking the founder. "quick:" or /quick always means S.
- Do exactly what was asked. Anything else you notice goes into OPEN.md as one line, not into the work.

## Roster: you pick per task
| Agent | Model | Effort | Use for |
|---|---|---|---|
| Coordinator (this session) | Opus 5.5 | xhigh | sizing, S tasks, merging, deploying, status |
| Advisor | Opus 5.5 | chosen by Claude Code | L plans, an error that keeps coming back, before calling an L task done |
| builder | Opus 5.5 | xhigh | M and L feature work, in its own worktree |
| expert | Opus 5.5 | xhigh | the demo-critical path: relay audio, latency, firmware, projector sync |
| reviewer | Opus 5.5 | xhigh | only the expert's demo-critical PRs, or when the founder asks |
| scout | Haiku 5.5 | xhigh | lookups: docs, versions, API names, file search |

## Parallel or sequential
- Run tasks in parallel only when they touch different folders.
- Shared contracts (toy and relay messages, content/demo.config.json, the agent file formats) change only through you, before builders start.

## Git and deploys
- S: commit straight to main. M and L: branch in a worktree, PR, squash-merge as soon as it builds, delete the branch.
- No GitHub Actions, no branch protection, no required checks, no reviews except the reviewer rule above.
- apps/web deploys only through Vercel's Git integration: main to production, PRs to previews. No manual deploys from branches.
- Supabase changes only by you, and only in the Tutor Grandma org (tlwtdcmdpydwzijvfogz), project Tutor Nani (ref cglximouqzxbnjhkhmzp). This repo is linked to it.
- Never touch hrizzup-staging or anything else in the founder's other Supabase org (Zugzwang-world's Org, ricebmnezbfuolqartfi): no links, queries, changes or deletes.
- Done means merged to main and checked live, on the URL or by running it. Read status from main, not from PR pages.

## Status for the thinking partner
After every merged change, update docs/thinking-partner/NOW.md: where we are, what is running, what is next, links. Questions for the founder or thinking partner go in OPEN.md. Decisions go in DECISIONS.md, one line each: date, decision, why. Keep all three short.

## Context
Keep HANDOFF.md current: state, open branches, running URLs, next actions in order. A fresh Coordinator must be able to resume from it alone. Send heavy reading to the scout or a builder to keep this session lean. If usage is near its limit, finish the current task, update HANDOFF.md and NOW.md, and stop.

## Keys
Keys live in .env.local (gitignored) and in Vercel env vars. Never commit them. The repo is public, and a pushed key gets blocked by GitHub or switched off by its provider, which breaks the demo.

## Credits
/preflight checks that the Kimi, ElevenLabs and Supabase keys work and reports the Kimi balance and the ElevenLabs characters left. It also checks Anthropic whenever Claude is the brain: `brain.provider` is "anthropic", or BRAIN_PROVIDER says claude, as it does now. Run it at the start of every step brief. Before any demo, also run `python3 -I scripts/selftest/selftest.py all`, then reset with `curl -X POST https://tutor-nani.vercel.app/api/reset`.
