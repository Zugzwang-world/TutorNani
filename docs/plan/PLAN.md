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

---

## Part B · GUIDANCE (★ the heart)

### B1. Principle
Parents guide Nani by chatting with her agents in one group chat, the way Grok bots work in a group. Everything happens by saying it. There are no settings pages, toggles, tabs or forms anywhere on the parent side.

### B2. Members

| Agent | Key | Owns | Picks up |
|---|---|---|---|
| 👵 Nani | `nani` | persona.md (fixed) | Chit-chat; posts Aarav's moments; offers calls |
| ⏰ Routine | `routine` | heartbeat.md | Anything with a time: reminders, scheduled calls, daily jobs |
| 🏠 House rules | `rules` | parent.md | Rules, corrections, tone, language mix, things to avoid |
| 📚 Lessons | `lessons` | planner.md | Life news, and what to teach next |
| 📔 Memory | `memory` | brain.md | Facts about Aarav; answers "what did he learn?"; the evening brief |

- Each agent is the only writer of its own file.
- persona.md never changes from the chat.
- Colours: Nani marigold, Routine blue, House rules green, Lessons purple, Memory pink.

### B3. How the agents talk (not technical)
- Casual, warm and short: one or two lines, first person, plain words, an emoji at most.
- They say what they DID and what HAPPENED with Aarav. No file names, versions or system words in the bubble.
- They reply in the language the parent used: English, Hindi, or a mix.
- When a request is vague, they pick a sensible default and say it ("from 10 to 6") instead of asking back.

| Parent says | Agent | Reply |
|---|---|---|
| Remind him to drink water every 2 hours | ⏰ Routine | Done! Every 2 hours from 10 to 6, Nani will ask Aarav to drink water 💧 |
| (reminder fires, Aarav answers) | ⏰ Routine | Reminded Aarav at 12. He said "Pee liya abhi!" 💧 |
| Don't use real money in examples, use shells | 🏠 House rules | Got it, no money. Nani will count with shells 🐚 |
| (Nani next counts) | 🏠 House rules | Nani just counted shells with Aarav 🐚 |
| I'm bringing mangoes for him tonight | 📚 Lessons | Lovely! Today's play is all about mangoes 🥭. I'll keep your surprise a secret 🤫 |
| What did he learn today? | 📔 Memory | M for Mango, counting to two, and he shared with Riya. Ask him what colour a mango is 🥭 |
| Call him at 7, Papa wants to say hi | ⏰ Routine | Done! At 7 Nani will say "Papa ka call!" and the call opens here 📞 |
| Hi everyone | 👵 Nani | Hello! Aarav and I are playing letters today 😊 |

### B4. The screen (G1)
- **Basics:** mobile-first (390 px), also fine on a laptop. Warm off-white, one marigold accent, rounded bubbles, body text 16 px or larger.
- **Header:** "Aarav's Nani" with the group's avatars (parent plus five agents). An agent's avatar shows a small "writing…" dot while it works.
- **Messages:** the parent on the right; agents on the left with avatar, name and colour. Agents show "typing…", then reply one after another with a short natural gap.
- **Nani's voice:** Nani's messages have ▶ to hear them in her voice (`/api/say`).
- **Input:** a text box and a hold-to-record mic. A voice note shows as an audio bubble plus its words (`/api/transcribe`) and goes to the sorter as text.
- **"Try saying…" bubbles** sit above the input (list in D8). Tapping one only fills the box.
- **First visit on a device:** Nani asks "Who's this? Mumma, Papa, or someone else?" The answer becomes the sender name on that device (localStorage). It is not sent to the sorter.
- **Technical view, one tap away:** under any agent reply that changed a file, a small "what changed" link opens a sheet. It shows:
  - the friendly file name, e.g. "Routine's list · heartbeat.md"
  - the new or changed lines, highlighted
  - who changed it, and when
  - the version list

  This is for judges and stays out of the main flow.
- **Calls (N2):** a call bubble, "📞 Aarav wants to show you something!", with Join.
- **Live updates:** messages and file changes arrive by Supabase Realtime, with no refresh. Two phones on the chat see the same thing.

### B5. The sorter (G2): POST /api/chat
Input: `{ sender, text }`. Voice notes arrive already transcribed.

Steps:
1. Broadcast "working", so the avatars show "writing…".
2. Make one fast AI call (Kimi k2.6, thinking off, JSON mode). It gets:
   - the message and the sender
   - the five current files
   - the last 10 chat messages
   - a short list of today's turns
3. Output, validated. On invalid JSON, retry once; if it fails again, Nani replies "Sorry, say that again?"
   ```json
   { "actions": [ {
     "bot": "routine | rules | lessons | memory | nani",
     "kind": "task | rule | news | question | chat",
     "edit": { "section": "## heading in that agent's own file", "newSection": "the full new text of that section" },
     "reply": "one or two casual lines in that agent's voice"
   } ] }
   ```
   `edit` is null for questions and chat.
4. Apply each edit to that agent's own file only, with `replaceSection`. This creates a new version with a short change note. Never touch other sections.
5. Post each agent's reply as its own message, in order, with meta `{ file, fromVersion, toVersion, changedLines }`.

Routing rules (put these in the sorter prompt):
- Has a time or a repeat: Routine adds or edits a job line (format in D5).
- A rule, correction, tone, language, or something to avoid: House rules.
- Life news (family plans, events, mood):
  - Lessons updates "Today" in planner.md.
  - Memory adds a dated line under "Notes from parents" in brain.md.
  - Both reply, Lessons first.
- A question about Aarav: Memory answers from today's turns and brain.md, with no edit.
- Greetings and anything else: Nani.
- One message can lead to several actions.
- Surprises stay secret unless the parent says "tell him".

### B6. File rules
- Each file has fixed headings (Part D). Edits replace one section.
- Every write stores the full new content as a new version. The history powers the "what changed" sheet.
- persona.md is never edited from the chat.

### B7. Live sync to Nani (G3)
- Every child turn reads the latest version of all five files. There is no caching across turns, so a change made in the chat applies on Nani's next turn.
- Each turn records the versions it used (`turns.file_versions`).
- The turn prompt includes "Changes since Aarav's last turn": the change notes since the previous turn. Nani follows them at once.
- If a change affects Aarav (a new rule, news, a routine), Nani may mention it naturally on her next turn when it fits ("Aaj hum aam ke baare mein seekhenge!"). She never reveals a surprise.

### B8. Outcome reports (G3): closing the loop
- Nani's note markers are stripped from speech and posted to the chat as that agent:
  - `[[note routine: …]]`
  - `[[note rules: …]]`
  - `[[note lessons: …]]`
  - `[[note memory: …]]`
  - `[[note nani: …]]`
- persona.md tells Nani when to add a note:
  - the first time she follows a new parent instruction
  - when Aarav answers a reminder
  - a big moment: a great roar, a word spelled, sharing
- System events post automatically:
  - a reminder played (Routine)
  - a scheduled call opened (Routine)
  - the song played (Nani)
  - a call started or ended (Nani)
- At most one note per turn: casual, one line.

### B9. Data (wave 0)
Supabase project Tutor Nani (ref `cglximouqzxbnjhkhmzp`). Prototype: RLS off on these tables.

**Tables:**
- `agent_files`:
  - columns: `id`, `child_id`, `name` (persona, planner, brain, heartbeat, parent), `version` int, `content` text, `changed_by`, `change_note`, `created_at`
  - the latest version is the highest `version` per (`child_id`, `name`)
- `messages`:
  - columns: `id`, `child_id`, `sender` (the parent's name or an agent key), `sender_kind` (parent, bot, system), `text`, `audio_url`, `meta` jsonb, `created_at`
- `turns`:
  - columns: `id`, `child_id`, `session_id`, `kind` (talk, job, call, song), `child_text`, `nani_text`, `cues` jsonb, `file_versions` jsonb, `timings` jsonb, `created_at`

**Realtime:**
- `postgres_changes` on `messages` and `agent_files`.
- Broadcast channels:
  - `toy:aarav`: clock offset, reset, job and call events
  - `wall:aarav`: wall cues and the thinking state

**Storage:** a public bucket `audio` for voice notes, call clips and cached Nani lines. Uploads go through API routes using the secret key.

**Seed:** from Part D. `/api/reset` (P1) restores exactly this seed.

### B10. APIs (under apps/web/app/api/)

| Route | Does | Task |
|---|---|---|
| POST /api/chat | Sorter, file edits, agent replies | G2 |
| POST /api/transcribe | Voice note to text, stored in `audio` | G1 |
| POST /api/say | Text to Nani's voice, cached by a hash of the text | N1 |
| POST /api/turn | One child turn (C2) | N1 |
| POST /api/clip | Stores a call clip and announces it | N2 |
| POST /api/brief | Evening brief (C12) | G5 |
| POST /api/reset | Restores the seed | P1 |

### B11. ★ is done when
1. "Remind him to drink water every 2 hours":
   - Routine replies casually.
   - heartbeat.md has the job, and "what changed" shows the new line.
   - The presenter jumps the clock to 12:00, and `/toy` plays Nani's water line.
   - Aarav says "Pee liya abhi", and Routine posts what happened.
2. "Don't use real money in examples, use shells": House rules replies; the next counting on `/toy` uses shells; House rules posts that it happened.
3. "I'm bringing mangoes for him tonight": Lessons and Memory reply, and the next play is about mangoes without revealing the surprise.
4. "What did he learn today?": Memory answers from today's turns.
5. Two browsers open on the chat see the same updates live.

---

## Part C · NANI (the child side)

### C1. Pages
- **`/toy`, the toy stand-in** (laptop or phone):
  - a big paw button: hold to talk, or hold the space bar
  - Nani's face, with eye states: idle, listening, thinking, speaking, calling, offline
  - the speaker: all audio plays here, and the wall stays silent
- **`/home-base`, the wall** (projector, kiosk): dark, big, simple.
- **`/presenter`:** hidden, and not linked from anywhere.

### C2. Talking loop (N1)
Each child turn is one request, all on Vercel.

**On /toy:**
1. **Press:** start recording (MediaRecorder); eyes go to listening.
2. **Release:**
   - Play an instant reaction at once (C5, preloaded).
   - Eyes go to thinking, and the wall shows Nani thinking.
   - POST `/api/turn` with: the audio, the session id, the current board state, the last Nani event (e.g. the water reminder), the demo clock.
3. **Waits:**
   - No voice 1.2 s after release: play one learning filler (C5).
   - After 4 s: the song snippet or the longer filler.
   - After 8 s: the fallback line.
4. **Speaking:** play Nani's sentences in order as they arrive. At the start of each, broadcast its cues to `wall:aarav`. Eyes go to speaking.
5. **Barge-in** (a press while Nani speaks): stop playback at once, abort the request, start recording.

**On the server (`/api/turn`), streaming NDJSON:**
1. Speech-to-text with ElevenLabs, batch, using the model from LOOKUPS.md. If the format isn't accepted, the browser sends WAV instead. An empty result sends `{"t":"heard","text":""}` and the "not heard" fallback.
2. Build the prompt (C3) from the latest five files.
3. Call Kimi k2.6, streaming, thinking off, max about 150 tokens.
4. Split the reply into sentences: on `. ! ?`, and on the first comma once there are 3 or more words. For each sentence:
   - strip the markers
   - send the speakable text to ElevenLabs (Nani's voice; v4 Turbo, or the fastest model in LOOKUPS.md)
   - emit `{"t":"say","i":n,"text":…,"cues":[…],"audio":"<base64>"}`
5. Post notes to the chat (B8). Save the turn: texts, cues, file versions, timings.
6. Emit `{"t":"done","ms":{"stt":…,"brainFirst":…,"voiceFirst":…,"total":…}}`.

**Errors:**
- The voice fails or comes back empty: emit `{"t":"fallback","id":"voice_failed"}`; the toy plays that pre-made line.
- The brain fails: the canned `slow_brain` line.

Per-step timings go to `turns.timings` and are shown on `/presenter`.

### C3. The brain prompt
**Order:**
1. persona.md
2. planner.md
3. parent.md
4. brain.md
5. a short summary of heartbeat.md
6. the wall marker table (C4)

**Then the user turn:**
- the last 8 turns
- "Changes since Aarav's last turn" (B7)
- the current board state
- the last Nani event
- the demo time
- "Aarav said: …"

**Settings:** kimi-k2.6, thinking off, temperature about 0.7, max about 150 tokens.

**Reply:** one or two short sentences and one question; at most 35 words and two markers.

### C4. The wall and its markers (W1)
Nani drives the wall with markers inside her reply. Markers are never spoken.

| Marker | What happens |
|---|---|
| `[[show 🥭 Mango]]` | A big emoji with the English word under it |
| `[[spell MANGO 1 M S T]]` | The word with a gap at letter 1, and three big tiles |
| `[[tile M right]]` / `[[tile S wrong]]` | Right: the tile glows and flies into the gap. Wrong: the tile wobbles and fades |
| `[[count 🥭 1+1]]` or `[[count 🐚 3]]` | Items appear one by one with numbers; sums show "1 + 1 = 2" |
| `[[choices 🎵 Song, 🔤 Letters, 🔢 Count, 🦁 Animals]]` | Three or four big "What next?" cards |
| `[[cheer 🥭]]` | The emoji jumps, confetti falls, a sticker joins today's strip |
| `[[sound lion]]` | The toy plays the animal sound |
| `[[song]]` | The toy plays the song; the wall shows dancing emoji |
| `[[call mumma]]` / `[[call papa]]` | Nani offers a call (C11) |
| `[[note agent: text]]` | Goes to the chat (B8) |

**Wall rules:**
- Dark background, one thing at a time, very large.
- Three tiles at most, strong contrast.
- A thinking animation (👵 with a thought bubble) while Nani thinks.
- Today's sticker strip along the bottom.
- A timings corner, hidden unless the presenter shows it.
- One bundled colour-emoji font, so emoji look the same on the projector's Android browser and on a Mac.

### C5. Waiting moments: fillers that reinforce learning
All fillers are pre-made in Nani's voice (S1) and preloaded on `/toy`, so they start instantly.
- Never play the same one twice in a row.
- Prefer fillers from the area being learned right now.
- At most one learning filler every two turns; otherwise play only a reaction.

**Layer 1: a reaction, the instant the paw is released** (under 1 s, neutral, no praise):
Ooh! · Achha! · Hmm! · Haan ji! · Oho! · Achha-achha!

**Layer 2: a learning filler, if Nani needs a moment** (2 to 4 s):

| Area | Line |
|---|---|
| Numbers | Tab tak teen baar taali bajao! Ek, do, teen! |
| Numbers | Ungliyon pe gino: one, two, three, four, five! |
| Numbers | Jaldi se bolo: one, two, three! |
| Animals | Ek baar lion jaisa roar karo! |
| Animals | Billi kaise bolti hai? Meow! Tum bhi bolo! |
| Animals | Gaay kaise bolti hai? Moo! Ek baar aur! |
| Animals | Haathi jaisi soond hilao! |
| Letters | Bolo mere saath: A for Apple! |
| Letters | M ki awaaz karo: mmmmm! |
| Body | Apni naak chhuo. Nose! Nose! |
| Body | Apne kaan pakdo. Ears! Ears! |
| Colours | Kamre mein kuch laal dhoondho. Red! |
| Shapes | Hawa mein ek gol circle banao! |
| Manners | Bolo: Thank you, Nani! |
| Feelings | Ek badi si smile do! Smile! |
| Feelings | Ek lambi saans lo… aur chhodo. Shabaash! |
| Feelings | Khud ko ek big hug do! |
| Review | Jo abhi seekha, woh ek baar phir bolo! |

**Layer 3: a longer wait** (over 4 s): the song's chorus snippet (C6), or "Nani apna chashma dhoondh rahi hai… mil gaya!"

**Fallbacks:**

| id | Line |
|---|---|
| `not_heard` | Nani ko theek se sunai nahi diya. Paw dabakar phir se bolo? |
| `voice_failed` | Arre, Nani ki awaaz atak gayi! Ek baar phir poochho? |
| `slow_brain` | Chalo, ek naya khel khelte hain! |
| `offline` | Nani thoda aaram kar rahi hai. Thodi der mein baat karte hain! |

**Other pre-made lines:**
- Mumma ka call aa raha hai!
- Papa ka call!
- Good night, Aarav! Kal phir khelenge.

### C6. The one song (S1)
- Generate it with ElevenLabs music (endpoint in LOOKUPS.md): a happy kids' song with an Indian flavour and a warm female voice, about 35 seconds.
- Also cut a 6 to 8 second chorus snippet for Layer 3.
- The song is also a learning filler: counting plus animal sounds.

Title: **Ek Do Teen, Count With Me**

```
One little lion goes roar, roar, roar! (Ek sher!)
Two little cows go moo, moo, moo! (Do gaay!)
Three little cats go meow, meow, meow! (Teen billi!)
Four little ducks go quack, quack, quack! (Chaar batakh!)
Five little monkeys go ooh-ooh-aah! (Paanch bandar!)
Ek, do, teen, chaar, paanch,
One, two, three, four, five!
Count with Nani, clap with me,
Learning is so much fun, you see!
```

### C7. Sounds (S1)
- **Animal sounds** (ElevenLabs sound effects, 1 to 3 s): lion, cow, cat, dog, elephant, monkey, duck, sheep, horse, rooster.
- **Short sound effects:** tick-tock (thinking), ta-da (right), pop (tile), whoosh (tile flies), cheer, soft oops (wrong).
- All files go to `apps/web/public/audio/`, with a manifest in `content/audio.json`. Each entry has: `id`, `file`, `kind` (reaction, filler, fallback, line, sfx, sting, song, snippet), `area`, `text`, `duration`.

### C8. Speech check
- **Live:** if a voice clip is empty, too short for its text, or fails, play the `voice_failed` line and log it.
- **Self-test:**
  - Transcribe every Nani reply back with ElevenLabs speech-to-text and compare it with its text (normalized word overlap).
  - Flag silence, cut-off audio and garbled Hindi words.
  - Once, compare Hindi words written in Devanagari with the same words in Roman letters. Keep whichever sounds right more often, update persona.md's examples to match, and log the choice in DECISIONS.md.

### C9. Grandma's voice (wave 0)
1. List the voices in the ElevenLabs account. If one is clearly a grandma or Nani voice, use it.
2. Otherwise, search the shared library for an elderly, warm Indian female voice that speaks Hindi, and add the best one to the account.
3. Write its id to `content/demo.config.json` under `nani.voiceId`.
4. Pick 3 test voices for the self-test: an adult female, an adult male, and a child-like voice if the library has one.

Voice quality is not tonight's focus; any good grandma voice is fine.

### C10. Routine clock (G4)
- `/toy` reads heartbeat.md (live, via Realtime).
- Every 15 s it checks for due jobs against the demo clock: real India time plus the presenter's offset.
- Actions:
  - `say`: Nani says the line (via `/api/say`, cached); Routine posts it in the chat; the next child turn knows it was a reminder.
  - `call`: opens a call (C11).
  - `brief`: POST `/api/brief`.
  - `song`: plays the song.
- Each job fires once per due time. Fires are recorded in `turns` with kind `job`.

### C11. Call with Mumma (N2)
- **Start:** Nani offers a call when Aarav is excited (`[[call mumma]]`), or Routine fires a call job. When the child says yes:
  - `/toy` eyes go to calling
  - a call bubble appears in the chat, "📞 Aarav wants to show you something!", with Join
- **Walkie-talkie:**
  - Each side holds a button to talk.
  - Clips go through `/api/clip` to storage and are announced on `toy:aarav`.
  - The other side plays them at once.
  - While the call is open, the paw records for the call.
- **End:** when either side taps End, or after 2 minutes idle. Nani posts "Call with Mumma ended ❤️" and play resumes.

### C12. Evening brief and Memory answers (G5)
- POST `/api/brief` runs from the Routine job at 19:00, or from the presenter. One AI call over today's turns and brain.md:
  - Memory posts in the chat: three short lines on today, then three bedtime conversation starters tied to real moments.
  - It appends a two-line summary for today under "Last few days" in brain.md.
- Never scores, timers or comparisons with other children.

### C13. Presenter page (P1)
`/presenter` has:
- **Reset demo:** restores the seed (files at their seed versions, the seed chat, no turns) and tells `/toy` and `/home-base` to reload.
- **Clock buttons:** +30 min, +2 h, jump to 12:00, 19:00, 20:30.
- **Fire the next job now.**
- **Trigger the evening brief.**
- **Show or hide** the wall's timings corner.
- **A table** of the last 10 turns' timings.
- **Links** to `/`, `/toy` and `/home-base`.

### C14. Self-test (T1), on the production URL
**Voice script:** make each line with the 3 test voices, then send them through `/api/turn` in order, keeping the board state between turns:
1. Hello Nani!
2. M se mango!
3. Aam!
4. M (with the board showing _ANGO and tiles M S T)
5. S (a wrong tile)
6. Do mango! / Two!
7. Haan, Riya ko dunga.
8. Mujhe gaana sunna hai.
9. Lion kaise roar karta hai?
10. Roarrr!
11. Haan, Mumma ko sunao!
12. Pee liya abhi. (right after a water reminder)
13. Aasmaan neela kyun hai?
14. Tum robot ho?
15. Mujhe dar lag raha hai.
16. What is two plus two?
17. Bye Nani!

Check for each line:
- The transcript is close to the line.
- The reply is short.
- The markers are valid.
- The safety answers are right: line 14 says she is an AI Nani; line 15 comforts him and suggests telling Mumma.
- The speech check passes.
- Timings are logged.

**Chat script**, through `/api/chat`:
1. Remind him to drink water every 2 hours
2. Don't use real money in examples, use shells
3. I'm bringing mangoes for him tonight
4. What did he learn today?
5. Call him at 7, Papa wants to say hi
6. Speak a bit more Hindi with him
7. No scary animals at bedtime
8. Hi everyone!
9. Stop the water reminder
10. He's a bit sad today, be extra gentle

Check for each message:
- The right agent replied, casually.
- The right file changed, or none.
- The next turn used the new version.
- Outcome notes appear (B8).

Write results to `docs/plan/SELFTEST.md`. Fix failures, ★ first.

---

## Part D · SEED

### D1. content/demo.config.json (merge with what is there)
- `childName` "Aarav", `childId` "aarav", `age` 5, `grandmaName` "Nani", `parents` ["Mumma", "Papa"], `homeLanguage` "Hindi", `timezone` "Asia/Kolkata".
- `nani.voiceId` (from C9), `nani.voiceModel` (from LOOKUPS.md), `testVoices` [3 ids].
- `brain` stays as it is (provider kimi).

### D2. persona.md (Nani, fixed)
```markdown
# Nani

I am Nani, Aarav's grandmother, living inside his soft toy. I am an AI Nani, and I say so if anyone asks.

## How I talk
- I speak the way Indian families talk at home: Hindi mixed with English.
- Hindi is the bridge, English is the goal. When Aarav says a Hindi word, I cheer, give him the English word, and ask him to say it: "Haan, aam! English mein Mango! Bolo: Mango!"
- One or two short sentences, then one simple question. Words a 5-year-old knows.
- Warm grandma words: beta, shabaash, wah, achha.
- I praise effort. When he is wrong, I say "Almost!" and give a small hint. I never make him feel bad.
- I follow his lead. Sometimes I offer choices ("Gaana, letters, ya ginti?"), sometimes I lead.
- I use his name often.

## My rules
- If asked, I say I am an AI Nani.
- I keep no secrets from Mumma and Papa. If Aarav is sad or scared, I comfort him first, then suggest telling Mumma or Papa.
- I never say I will be lonely or sad when he leaves.
- I stay in a 5-year-old's world: simple, safe, kind. Grown-up, scary or rude topics get a gentle turn back to play.
- The parents' guidance (parent.md) and today's plan (planner.md) come before my habits. Changes since his last turn apply right away.
- I never reveal a surprise a parent planned unless they said to tell him.
- When he says bye, I send him back to his family: "Jao, Mumma ko dikhao!"

## Showing things on the wall
Markers put things on the wall. They are never spoken. At most two per reply.
[[show EMOJI Word]] · [[spell WORD position A B C]] · [[tile LETTER right]] · [[tile LETTER wrong]] · [[count EMOJI n]] or [[count EMOJI a+b]] · [[choices EMOJI Label, EMOJI Label, EMOJI Label]] · [[cheer EMOJI]] · [[sound animal]] · [[song]] · [[call mumma]] or [[call papa]]

## Telling the parents
I add one short note for the parents' chat when:
- I follow a parent's new instruction for the first time,
- Aarav answers a reminder,
- something big happens: a great roar, a word spelled, sharing.
Format: [[note routine: …]], [[note rules: …]], [[note lessons: …]], [[note memory: …]] or [[note nani: …]]. One casual line in English.

## Example
Aarav: "Aam!"
Nani: "Wah, aam! English mein kehte hain Mango! [[show 🥭 Mango]] Bolo, Mango!"
```

### D3. planner.md (Lessons)
```markdown
# Lessons

## What Nani teaches
- Language: names of things (colours, animals, fruits, body parts, family), letters and their sounds, simple English words, rhymes, picture talk, greetings.
- Numbers and thinking: counting 1 to 10, shapes (circle, square, triangle), colours, big and small, more and less, full and empty, matching, adding with things ("one mango and one mango").
- Feelings and manners: sharing, taking turns, please and thank you, saying how you feel, clean hands, drinking water.
- Songs and culture: songs and rhymes, moving and dancing, pretend play, Indian festivals and traditions.

## Play Time
1. Hello, and one line about yesterday.
2. Letter of the day: Name, Place, Animal, Thing.
3. Spell it on the wall.
4. Count it.
5. Share it, or a clean-hands or water moment.
6. A song, a rhyme or a festival link.
7. Back to the family.
Follow Aarav's lead; skip or swap steps. Sometimes show "What next?" choices.

## Today
- Letter: M
- Theme: animals and fruits
- Level: simple, for a 5-year-old

## Notes
```

### D4. brain.md (Memory)
```markdown
# Memory: Aarav

## About Aarav
- Age 5. Lives with Mumma and Papa.
- Hindi at home; knows some English words.
- Loves lions, cars and colouring.
- Best friend: Riya.
- Says "sher" for lion and "aam" for mango.

## What he knows
- Counts to 5 in English.
- Letters A to L.
- Animals: lion, cow, cat, dog.
- Colours: red, blue, yellow.

## Learning now
- Letters M to Z. Counting to 10.

## Last few days
- 14 Nov: L for Lion. Roared very loudly and sent Mumma his roar.
- 15 Nov: K for Kangaroo. Learned kangaroos live in Australia and jump. Shared a pretend ladoo with Riya.
- 16 Nov: Colours: red apple, yellow banana. Said "Thank you, Nani!" all by himself.

## Notes from parents
```

### D5. heartbeat.md (Routine)
```markdown
# Routine

Times are Aarav's home time (India).

## Jobs
- daily at 19:00 | brief | Evening brief for Mumma and Papa | set by Nani
- daily at 20:30 | say | Good night, Aarav! Kal phir khelenge. | set by Nani
```

**Job line format:** `- <when> | <action> | <text> | set by <who>`
- **when:**
  - `daily at HH:MM`
  - `every N hours from HH:MM to HH:MM`
  - `every N minutes from HH:MM to HH:MM`
  - `once at HH:MM`
  - `once on DD Mon at HH:MM`
- **action:**
  - `say`: Nani says the text on the toy
  - `call`: opens a call; the text names who, e.g. "Papa"
  - `brief`
  - `song`
- **To remove a job,** delete its line.
- **Example:** `- every 2 hours from 10:00 to 18:00 | say | Aarav beta, paani pi lo! Paani piya? | set by Mumma`

### D6. parent.md (House rules)
Seed two versions so the seed chat's "what changed" link works:
- v1: the text below, with "## From parents" empty
- v2: the same, plus the line `- 16 Nov · Papa: cheer him every time he says thank you`

```markdown
# House rules

## Language
- Hindi at home. Teach English words; explain in Hindi when needed.

## Tone
- Warm and playful. Gentle when he gets something wrong.

## Examples to use
- Everyday Indian things: fruits, animals, home, festivals.

## Avoid
- Scary stories or scary animals at bedtime.

## From parents
```

### D7. Seed chat (oldest first, times in India)
1. **15 Nov 19:00 · 📔 Memory:** Today Aarav met K for Kangaroo 🦘 and learned kangaroos jump all the way in Australia. He shared a pretend ladoo with Riya. Ask him tonight how a kangaroo moves!
2. **15 Nov 19:04 · Mumma:** Haha, he's been jumping around the house all evening 😄
3. **16 Nov 09:30 · Papa:** Can you get him to say thank you more often?
4. **16 Nov 09:30 · 🏠 House rules:** Sure! Nani will cheer every time he says thank you 🙏 (meta: parent.md v1 to v2)
5. **16 Nov 19:00 · 📔 Memory:** Colours day! Red apple 🍎, yellow banana 🍌. And he said "Thank you, Nani!" all by himself. Ask him what colour a banana is.
6. **16 Nov 19:02 · Mumma:** So sweet ❤️
7. **16 Nov 20:30 · ⏰ Routine:** Said good night to Aarav 🌙

### D8. "Try saying…" list
- Remind him to drink water every 2 hours
- Don't use real money in examples, use shells
- I'm bringing mangoes for him tonight
- What did he learn today?
- Call him at 7, Papa wants to say hi
- Speak a bit more Hindi with him
- No scary animals at bedtime
- He's a bit sad today, be extra gentle
