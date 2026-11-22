# CONTRACTS · how the overnight tasks connect

Owned by the Coordinator. Builders use these exactly. If one does not work for you, say so in your report; do not change it silently. Types live in `apps/web/lib/types.ts`.

## Shared layer (apps/web/lib, already on main: use it, never re-implement)
| File | Gives you | Where |
|---|---|---|
| `config.ts` | `config` (content/demo.config.json), `CHILD_ID` ("aarav"), `BUBBLES` (idea bubbles, R2.4), `brainSettings()` | both |
| `types.ts` | FileName, BotKey, `BOTS` (name, emoji, colour, file, fileLabel), Message, MessageMeta, Turn, Cue, Note, Job, TurnEvent, BoardState, NaniEvent, AudioEntry, `channelName`, event unions | both |
| `supabase/server.ts` | `supabaseAdmin()` (secret key) | server |
| `supabase/browser.ts` | `supabaseBrowser()` (publishable key: reads and Realtime only) | client |
| `files.ts` | `getLatest`, `getAllLatest`, `getHistory`, `getChangesSince`, `replaceSection` → {fromVersion, toVersion, changedLines, removedLines, changed}, `writeFile` | server |
| `files-pure.ts` | `getSection`, `sectionLines`, `replaceSectionText`, `diffLines` | both |
| `messages.ts` | `post(child, sender, senderKind, text, meta?, audioUrl?)`, `recent(child, n)`, `updateMeta(id, meta)` | server |
| `markers.ts` | `parseMarkers(text)` → {speech, cues, notes, invalid}, `stripMarkers`, `hasOpenMarker`, `cueToMarker` | both |
| `jobs.ts` | `parseJobs(heartbeatMd)`, `parseJobLine`, `formatJob`, `jobSecondsOn(job, "17 Nov")` (seconds after midnight), `jobTimesOn` (minutes, old callers), `toSeconds`, `fromSeconds`, `stampOnceDate`, `summarizeJobs` | both |
| `clock.ts` | `clockParts(date)` → {hhmm, minutes, dayLabel, dateKey, label} in India time, `demoNow(offsetMs)`, `offsetToJumpTo("12:00", offset)` | both |
| `demo-state.ts` | `getDemoState(child)`, `setDemoState(child, {clock_offset_ms?, show_timings?})` | server |
| `brain.ts` | `brainComplete`, `brainJson`, `brainStream` (async generator of text deltas). Provider and model come from config. Kimi: thinking off; temperature is fixed by the API, so don't send it | server |
| `eleven.ts` | `stt(blob, {filename?, languageCode?})` (scribe_v3), `ttsStream(text, opts)`, `tts(text, opts)` (Nani's voice, eleven_v4_turbo by default) | server |
| `broadcast.ts` | `broadcast(topic, event, payload)`, `broadcastSafe(...)` (REST, secret key) | server |
| `audio.ts` | `AUDIO` (manifest entries), `audioById(id)`, `audioByKind(kind)` | both |
| `seed.ts` | `resetToSeed(child)`: seed files and chat, the progress seed (content/progress-seed.json), clock at real time | server |

Rules: builders do not edit `app/layout.tsx`, `app/globals.css`, `lib/*.ts` above, `content/demo.config.json` or `content/seed.json`. Need a change? Put it in your report and the Coordinator does it. Theme colour tokens are in globals.css: `cream paper ink muted line marigold(-soft) routine(-soft) rules(-soft) lessons(-soft) memory(-soft) wall`. The `.emoji` class uses the bundled Noto Color Emoji.

Next.js 16.4.6 with cacheComponents on: read `apps/web/AGENTS.md` and the matching guide in `apps/web/node_modules/next/dist/docs/` before writing Next code. Pages that fetch live data are simplest as client components that read Supabase in the browser. API routes are Node (`export const runtime` not needed; never `edge`). Long routes: `export const maxDuration = 60`.

## Database (Supabase, RLS off)
- `agent_files(id, child_id, name, version, content, changed_by, change_note, created_at)`: latest is the max version per (child_id, name).
- `messages(id, child_id, sender, sender_kind, text, audio_url, meta, created_at)`: order by `id`.
- `turns(id, child_id, session_id, kind, child_text, nani_text, cues, file_versions, timings, meta, created_at)`.
- `demo_state(child_id, clock_offset_ms, show_timings, updated_at)`: one row per child.
- `progress_days(child_id, day, data jsonb, updated_at)`, primary key (child_id, day): the progress report (R7.2). `data` is `ProgressDayData` in types.ts. Not in the realtime publication.
- Browser: read with `supabaseBrowser()`, subscribe with `postgres_changes` (filter `child_id=eq.aarav`). All four tables are in the realtime publication.
- Writes happen only in API routes, with the server helpers.
- Storage bucket `audio` (public). Paths: `voice/<uuid>.webm` (parent voice notes), `say/<sha1 of voice+model+text>.mp3` (cached Nani lines), `clips/<callId>/<ts>.wav` (call clips, 16 kHz WAV so every browser plays them). Public URL: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/<path>`.

## Refinement run contracts (REFINE.md, Wave 0)
- **Job lines** (heartbeat.md `## Jobs`, lib/jobs.ts): `daily at HH:MM[:SS]` · `every N minutes|hours from HH:MM[:SS] to HH:MM[:SS]` (a window) · `every N minutes|hours from HH:MM[:SS]` (no end: due at the start, then every N to the end of each day, until removed; "now, and then every 2 hours" is `every 2 hours from <now>`) · `once on DD Mon at HH:MM[:SS]` · `once at HH:MM[:SS]` (old form, today only: /api/chat stamps today's date on new ones). Then `| say|call|brief|song | text | set by Who`.
- **Wall markers** (lib/markers.ts, Cue in types.ts): `[[show EMOJI Word | hindi | EMOJI EMOJI]]`, where everything after the first `|` is optional → `{type:"show", emoji, word, hindi?, extras?}` (at most 2 extras). `[[count EMOJI n both]]` or `[[count EMOJI a+b both]]` → `{type:"count", …, both:true}`: every number shows its Hindi and English names. The old forms still work.
- **Idea bubbles** (`bubbles` in content/demo.config.json, `Bubble` in types.ts, `BUBBLES` in config.ts): `{id, parent, situation, line, agents: BotKey[], scene, step?, image?}`. The phone's "Try saying" chips use the same lines.
- **Progress data** (`progress_days`, `ProgressDayData` in types.ts): words, letters, counting, areas, moods, tricky, routine, highlights, starters, and an optional `summary` (the day's three lines). History in content/progress-seed.json (`ProgressSeed`), restored by /api/reset.
- **Stage seams:** `lib/wall-bus.ts` (`createWallBus()`, `WallEvent`): on /stage the toy core emits wall events on the bus (and still broadcasts on wall:<child> for a projector), and `<Wall bus={bus} />` listens to the bus instead of the channel. `<GuidanceChat sender="Mumma" fill />`: a fixed sender (no "Who's this?", no localStorage) that fills its parent's height. `useChat().sendText(text, as?)`: `as` sends as that parent (bubbles).
- **Reset** (`POST /api/reset`): returns `{ok, ready: true, files, messages, progressDays, warm: {brainMs, voiceMs, dbMs}}` after the R8.2 warm-up (one tiny brain, voice and database call). `?warm=0` skips the warm-up.

## API routes
| Route | Request | Response | Owner |
|---|---|---|---|
| POST /api/chat | JSON `{ sender, text, audioUrl?, clientId? }` | `{ ok, actions: [{ bot, kind, changed, file?, toVersion? }] }` once all replies are posted | G2 |
| POST /api/transcribe | multipart `file` (webm/ogg/mp4/wav) | `{ text, audioUrl }` (audio stored at `voice/…`) | G1 |
| POST /api/say | JSON `{ text, voiceId? }` | `{ url, cached }`: public mp3 in Nani's voice, cached by hash | N1 |
| POST /api/turn | multipart: `audio` (file) OR `text` (string, skips STT; for tests), `sessionId`, `board` (JSON BoardState), `lastEvent` (JSON NaniEvent or "null"), `clockOffsetMs` | NDJSON stream of `TurnEvent` lines (types.ts): `heard`, then `say` (in order, i = 0,1,…), `fallback`, `done` | N1 |
| POST /api/reset | none | `{ ok, files, messages }`; broadcasts `reset` on toy and wall | Coordinator (P1 extends) |
| POST /api/event | JSON `{ bot, text?, meta?, turn?: { kind, child_text?, nani_text?, meta? } }` | `{ ok, turnId?, messageId?, duplicate? }`. Posts `text` as that bot (meta kind "event"). With `turn`, records a turns row; a job fire uses `turn: { kind: "job", meta: { jobKey, dueAt } }`, and a repeat of the same jobKey + dueAt returns `duplicate: true` and posts nothing | Coordinator |
| POST /api/clip | wave 2 (N2) | | N2 |
| POST /api/brief | wave 2 (G5) | | G5 |

/api/chat behaviour:
1. Post the parent's message first (`sender_kind` "parent", meta `{ clientId }`, plus `{ kind: "voice", transcript }` and `audio_url` for voice notes).
2. Broadcast `chat:aarav` `working`. Payload `bots` is the FULL set currently writing (replace, don't merge); `on: false` clears all. At the start, send all five bots; after sorting, only those about to reply.
3. Post each agent reply in order, as soon as its action is ready (streamed sorter), with a natural gap of 0.8 to 1.6 s. Reply meta: `{ file, fromVersion, toVersion, changedLines, removedLines }` when its file changed. A removal has empty changedLines and the removed line in removedLines.

## Realtime broadcast (topics from `channelName`)
- `chat:aarav`: `working {bots, on}`.
- `wall:aarav`: `cue {cue}` (the toy sends one per cue as each sentence starts), `thinking {on}`, `speaking {on}`, `timings {show, ms?}`, `reset {}`.
- `toy:aarav`: `clock {offsetMs}`, `reset {}`, `fire_next_job {}`, `job {job, dueAt}`, `call {callId, state, who}`, `clip {callId, from, url, sender}`.
- The browser sends with `channel.send({type:"broadcast", event, payload})` after subscribing; servers use `broadcast()`.
- `reset` on toy or wall means `location.reload()`.

## Messages meta (types.ts MessageMeta)
- Agent reply with an edit: `{ file, fromVersion, toVersion, changedLines }`. This shows the "what changed" link.
- Voice note: `kind: "voice"`, `transcript`, and `audio_url` set.
- Outcome note from Nani's turn (B8): `kind: "note"`. System event: `kind: "event"`. Evening brief: `kind: "brief"`. Call: `kind: "call"`, `callId`, `callState`.
- `sender` is a BotKey for agents and the parent's chosen name for parents.

## Audio manifest (content/audio.json, S1 writes it; `lib/audio.ts` reads it)
JSON array of `AudioEntry { id, file, kind, area?, text?, duration }`. `file` is a public path like `/audio/reaction_ooh.mp3`; `duration` is in seconds.
- kinds: `reaction`, `filler`, `fallback`, `line`, `sfx`, `sting`, `song`, `snippet`, `music` (`wait_music`, R3: plays only when Nani is late).
- ids (fixed):
  - reactions: `reaction_ooh`, `reaction_achha`, `reaction_hmm`, `reaction_haanji`, `reaction_oho`, `reaction_achha_achha`
  - fillers: `filler_<area>_<n>` with area `numbers`, `animals`, `letters`, `fruits`, `body`, `colours`, `shapes`, `manners`, `feelings`, `review` (n from 1); the long wait line is `filler_wait_chashma` (area `wait`)
  - fallbacks (id = the TurnEvent fallback id): `not_heard`, `voice_failed`, `slow_brain`, `offline`
  - lines: `line_call_mumma`, `line_call_papa`, `line_good_night`
  - animal sounds (kind `sfx`, area `animals`): `animal_lion`, `animal_cow`, `animal_cat`, `animal_dog`, `animal_elephant`, `animal_monkey`, `animal_duck`, `animal_sheep`, `animal_horse`, `animal_rooster`. `[[sound lion]]` plays `animal_lion`.
  - effects (kind `sfx`): `sfx_ticktock`, `sfx_tada`, `sfx_pop`, `sfx_whoosh`, `sfx_cheer`, `sfx_oops`
  - song: `song` (kind `song`), `song_snippet` (kind `snippet`, 6 to 8 s)
- Until S1 lands, the manifest is `[]`. Code must skip missing ids quietly.

## Toy eye states
`idle`, `listening`, `thinking`, `speaking`, `calling`, `offline`.
