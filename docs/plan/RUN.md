<!-- Split from PLAN.md: Summary and Part A -->
# PLAN.md · Tutor Grandma overnight beta

For the Coordinator. The founder is asleep for this whole run. Read the Summary and Part A fully. Builders read only the part their task points to.

## Summary
- **Goal:** a working beta of everything except hardware, live on https://tutor-nani.vercel.app
  - `/` the parents' guidance chat
  - `/toy` the toy stand-in
  - `/home-base` the wall
  - `/presenter` a hidden presenter page
- **The novelty, where most of the effort goes (★):** parents guide Nani by chatting with her five agents in one group chat, the way Grok bots work in a group. Each agent edits its own file. Nani picks the change up on her next turn and the agents report back what happened, in plain casual words.
- **Run length:** about 7 to 8 hours.
- **Usage:** the weekly figure was 4% at the start. Aim to end at or below 10%. Never go above 15%.
- **Never ask the founder anything.** Decide, log one line in OPEN.md, continue.

---

## Part A · RUN

### A1. Wave 0: first steps (Coordinator, in order, all size S)
1. Save this file as `docs/plan/PLAN.md` (from the attachment, or from `~/Downloads/PLAN.md`). Split it into:
   - `docs/plan/RUN.md`: Summary and Part A
   - `docs/plan/GUIDANCE.md`: Part B
   - `docs/plan/NANI.md`: Part C
   - `docs/plan/SEED.md`: Part D

   Create `docs/plan/RUNLOG.md` with the start time (T0) and the starting usage (4% weekly). Commit to main.
2. Usage reader (A6).
3. Run `/preflight`.
4. Scout lookups (A7): answers go to `docs/plan/LOOKUPS.md`.
5. Grandma's voice (C9).
6. Data (B9), seeded from Part D.
7. Shared layer and contracts (A8). Install every package the waves need, once.
8. Advisor: one review of the wave plan against this file. Adjust, log, go.

### A2. Rules for this run (they override CLAUDE.md where they differ)
- **The founder is asleep.**
  - Never ask, never wait for a confirmation, never stop at "should I proceed". Pick the best option, log one line in OPEN.md, continue.
  - If you would normally ask the founder to copy a key or variable, do it yourself: `.env.local`, plus the Vercel CLI with `--scope hrizzup`, piping values with `printf %s`.
- **Sizing:** you size and resize tasks yourself. The sizes here are the plan; log any change.
- **Reviewer:** only on ★ PRs and N1. **Advisor:** twice, once on the wave plan and once before calling ★ done.
- **Done** means merged to main, deployed, and checked on the production URL. Preview URLs return 401.
- **Before writing Next.js code**, read `apps/web/AGENTS.md` (Next 16.4.6, cacheComponents on).
- **Keys** never go in code or logs; the repo is public.
- **Out of scope:** no hardware, firmware or Sarvam work. The Grok desk is not used tonight.
- **Brain:** Kimi all night (`brain.provider` stays `kimi`).
- **Credit:** no caps on ElevenLabs or Kimi tonight (founder's call).

### A3. Orchestration
- You plan, launch, merge and check. You build only S tasks yourself.
- Launch builders and experts as background subagents: each in its own worktree, one task each, each ending in a PR.
- Run tasks in parallel only when they touch different folders (A9 lists them).
- Merge one PR at a time:
  1. Squash-merge and delete the branch.
  2. Run `git pull --ff-only` on main.
  3. Check production.
- Give each builder:
  - its row from A9
  - the path of the part it needs (GUIDANCE.md or NANI.md)
  - the shared layer it must use (A8)
- Builders report in five lines or fewer.

### A4. Context hygiene (long run)
- Keep this session lean. Never paste whole files into the chat; send reading to the scout or a builder.
- At every checkpoint (wave start and end, every merge, every hour), append one line to RUNLOG.md: time, elapsed, wave, what merged, usage or tokens, next. Keep HANDOFF.md current.
- After any compaction or restart, re-read RUN.md, RUNLOG.md and HANDOFF.md before acting.

### A5. Time guard
- T0 is in RUNLOG.md. Check elapsed time at every checkpoint.
- After 6.5 hours: no new features, only tests and fixes.
- After 7.5 hours: write the report (A11), then stop.
- Stop by 8 hours at the latest.
- If everything is done early, work down the polish list (A10) until the 6.5-hour mark.

### A6. Usage guard (weekly only; this plan has no 5-hour limit)

**Live reading (try first):**
1. Add a `statusLine` to the project's `.claude/settings.json`: command `bash .claude/usage-snapshot.sh`, `refreshInterval` 60.
2. The script reads the JSON on stdin and writes `{"weekly": <rate_limits.seven_day.used_percentage>, "at": <unix time>}` to `.claude/usage-now.json` (gitignored). It prints one short line.
3. After a few turns, check whether `.claude/usage-now.json` holds a number. If yes, use live mode. If not, use fixed mode: the desktop app may not run status lines. Log which mode you are in.

**Live mode thresholds:**

| Weekly usage | Do |
|---|---|
| Under 8% | Full speed: up to 4 agents at once, xhigh effort, reviewer on ★ |
| 8% or more | Up to 3 at once; effort high outside ★ |
| 10% or more | Finish what is running, then only ★ fixes and tests; effort medium outside ★ |
| 13% or more | No new work: final tests and the report |
| 15% | Stop |

**Fixed mode (no live number), pace by design:**
- Up to 4 agents at once in wave 1, 3 in wave 2, 2 in wave 3.
- xhigh effort only for ★ tasks and N1. High for the rest. The scout (Haiku) does every lookup.
- No full test suites. One proving check per PR.
- After each wave, log in RUNLOG.md the total tokens used so far, summed from this project's local Claude Code transcripts (`~/.claude/projects/`). The founder compares that with /usage.

### A7. Scout lookups (wave 0, one batch, into docs/plan/LOOKUPS.md)
Confirm each item from official docs, with links:
1. **ElevenLabs speech-to-text** (batch, file upload): current model id and endpoint; accepted audio formats (is webm/opus OK?); language setting for Hindi mixed with English.
2. **ElevenLabs text-to-speech with Eleven v4 Turbo:** model id, and the fastest endpoint that accepts it (HTTP stream or WebSocket; RESEARCH.md §1 flags the Text-to-Dialogue WebSocket); output formats; `language_code` for Hindi.
3. **ElevenLabs sound effects** endpoint.
4. **ElevenLabs music** endpoint, for a song with lyrics.
5. **ElevenLabs voices:** list the account's voices; search the shared voice library; add a shared voice to the account.
6. **Kimi (Moonshot) chat completions:** JSON mode (`response_format`), thinking off (`"thinking": {"type": "disabled"}`), streaming.
7. **Supabase Realtime** with the new publishable key, from the browser: `postgres_changes` on a table, and broadcast channels.

### A8. Shared layer and contracts (wave 0, Coordinator, before any builder starts)
In `apps/web/lib/`. Builders use these and never re-implement them.
- `supabase/`: server client (secret key) and browser client (publishable key).
- `files.ts`:
  - `getLatest(child, name)`, `getAllLatest(child)`, `getHistory(child, name)`
  - `replaceSection(child, name, heading, newSectionText, by, note)` returns the new version and the changed lines.
- `messages.ts`: `post(child, sender, senderKind, text, meta)`.
- `markers.ts`: parse and strip Nani's markers (C4) from text.
- `jobs.ts`: parse heartbeat.md job lines (format in D5).
- `types.ts`: FileName, BotKey, Message, Turn, Cue, Job, TurnEvent (C2).
- `config.ts`: reads `content/demo.config.json`.

Also in wave 0:
- **Base layout:** fonts (a rounded Latin font, Noto Sans Devanagari, one bundled colour-emoji font) and the Tailwind theme colours.
- **Who owns shared files:** builders do not edit `app/layout.tsx` or `globals.css`; anything global goes through you.
- **Env vars** are present everywhere; child id `aarav` is in the config.

### A9. Waves
Folders are under `apps/web/` unless noted.

| Wave | # | Task | Folders | Size | Who |
|---|---|---|---|---|---|
| 0 | | A1 steps 1 to 8 | various | S | Coordinator, scout, advisor |
| 1 | G1 ★ | Guidance chat page (B4) | `app/page.tsx`, `components/chat/**`, `app/api/transcribe/**` | L | builder |
| 1 | G2 ★ | Sorter and the five agents (B5, B6) | `app/api/chat/**`, `lib/agents/**` | L | builder, reviewer |
| 1 | N1 | Talking loop and toy page (C2, C3) | `app/toy/**`, `app/api/turn/**`, `app/api/say/**`, `lib/voice/**` | L | expert, reviewer |
| 1 | W1 | Wall (C4) | `app/home-base/**`, `components/wall/**` | M | builder |
| 1 | S1 | Sounds: reactions, fillers, fallbacks, effects, the song (C5 to C7) | repo `scripts/audio/**`, `public/audio/**`, repo `content/audio.json` | M | builder |
| 2 | G3 ★ | Live sync and outcome reports (B7, B8) | `app/api/turn/**` (notes and change list only), `lib/agents/**`, `components/chat/**` | M | expert, reviewer |
| 2 | G4 | Routine clock (C10) | `lib/routine/**`, a small hook in `app/toy` | M | builder |
| 2 | G5 | Evening brief and Memory answers (C12) | `app/api/brief/**`, `lib/agents/memory*` | M | builder |
| 2 | N2 | Call with Mumma (C11) | `lib/call/**`, `app/api/clip/**`, `app/toy`, `components/chat/call*` | L | expert |
| 2 | P1 | Presenter page and reset (C13) | `app/presenter/**`, `app/api/reset/**` | M | builder |
| 3 | T1 | Self-test and fixes (C14) | repo `scripts/selftest/**` | M | expert, Coordinator |
| 3 | T2 | Report and toy contract (A11) | repo `docs/**` | S | Coordinator |

Order within the waves:
- S1 starts as soon as the grandma voice is chosen; it is mostly API calls.
- G3 starts after G1, G2 and N1 are merged.
- G4 runs before N2, because both touch `app/toy`.

### A10. Polish list (only after all waves, before the 6.5-hour mark, in this order)
1. Guidance chat feel: typing rhythm, the avatar "writing…" dots, a smooth new-line animation in the "what changed" sheet, voice-note handling.
2. Agent replies: more natural, varied, and full of what happened with Aarav.
3. More learning fillers matched to today's topic.
4. Wall animations.
5. Talking-loop speed: measure, then tune.

### A11. Report (T2)
Update `docs/thinking-partner/NOW.md` with:
- **Links:** `/`, `/toy`, `/home-base`, `/presenter`.
- **What works:** one line per feature, ✓ or ✗.
- **Timings over the self-test:**
  - median per step: speech-to-text, brain first word, voice first audio, total
  - perceived: from paw release to the first sound
- **Speech check:** pass rate and the worst examples.
- **Usage:** live % at the end, or tokens per wave.
- **Known issues and next steps.**

Also update:
- DECISIONS.md: one line per decision made tonight.
- OPEN.md: questions for the founder.
- HANDOFF.md.
- `docs/toy-contract.md`: the `/api/turn` request and stream, plus the `toy:aarav` channel events, so the hardware track can build against them.

