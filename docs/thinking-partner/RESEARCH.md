# Tutor Grandma: research digest

Replaces the four research reports (R1 hardware, R2 voice pipeline, R3 agent and memory, R4 parent website), which are not kept. It holds only what still applies to the lean build. If anything here conflicts with DECISIONS.md, DECISIONS.md wins.

Tags: **Core** = part of the demo loop · **Option** = the planning chat decides · **Later** = at the buildathon switch · **Verify** = check official docs when building. Research date: 16 Nov 2026.

## 0. Already decided (overrides the reports)
- One agent per child with five .md files and demo-level memory. R3 proposed five agents and a full memory vault: cut.
- Live brain: Kimi kimi-k2.6 through the switch in content/demo.config.json, then Claude Haiku 5.5 at the buildathon. R2 and R3 assumed Claude from the start.
- No Fly.io and no region probes. R2 put the relay on Fly.io, so the relay host is open again (section 3).
- Sarvam deferred to the buildathon day. Hardware is a separate track; software runs end to end without the toy.

## 1. The voice loop (R2) — Core

```
press   -> open STT stream (keyterms for this round); audio streams while held
release -> play an earcon at once ("Hmmm...") + commit STT -> transcript
        -> referee in code (check_word) -> brain (streamed, short)
        -> sentence splitter -> TTS stream (grandma's clone) -> audio out
        -> projector cue fires with the sentence that mentions the animal
```

**Hearing: ElevenLabs Scribe realtime**
- `commit_strategy: manual`, committed on release. No waiting for silence detection.
- Open the stream on press, not on release.
- Keyterms per round: at most 50 terms of 20 characters (letter M: Mumbai, Mango, Monkey, Mouse...). Changing keyterms needs a fresh stream, so open one per press.
- Language hint `en` for English rounds. No auto-detect on short child utterances.
- `scribe_v2_realtime` (about 150 ms) supports manual commit. `scribe_v3_live` is more accurate; its manual commit support is **Verify**.
- No benchmark exists for 5 to 8-year-old Indian English. Record about 20 real child utterances and measure.

**Referee before the brain**
- `check_word(letter, category, word)` runs in code, with fuzzy or phonetic matching (Levenshtein 2 or less, or Double Metaphone) against curated lists per letter and category. A child's "Mumbai" may come back as "Bombay" or "mum by".
- Pass the verdict in the user turn ("Child said Monkey for Animal/M: VALID"). This saves a model round trip on every answer.
- Low confidence or no match: grandma asks a yes/no question ("Did you say Monkey?").

**Brain**
- Stream, max about 150 tokens. Game turns get one sentence plus a question; side questions get at most two short sentences. The first token is the bottleneck.
- Slow-brain guard: no first token after 1.2 s, play a pre-made "Let me think, beta..."; at 4 s, play a canned game-safe line ("Let's try another one!") and log it.

**Voice: Eleven v4 Turbo (`eleven_v4_turbo`)**
- Stream over the Text-to-Dialogue WebSocket: `wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=eleven_v4_turbo&output_format=pcm_16000&language_code=en`. The regular TTS WebSocket returned HTTP 400 for v4 in a third-party test (Micdrop), while the official reference still says eleven_v3 only: **Verify**.
- Protocol:
  - The first message registers the voice: `{voices:[voiceId], voice_settings:{stability:0.5}}`.
  - Each sentence is sent as `{inputs:[{text, voice_id}], flush:true}`.
  - Replies carry base64 `audio`, `is_final_audio_for_turn` and `is_final`.
- Send `keep_alive` every 15 s, because the server closes after 20 s idle. There is no stop message: to interrupt, close and reopen (about 90 ms).
- Flush every sentence. Micdrop measured first audio at 138 ms with a flush and 355 ms without; on a warm socket the next answer started in 90 to 120 ms.
- Sentence splitter: split on `. ! ?` and on the first comma once there are 3 or more words. Keep "..." inside the sentence, since v4 performs it as a pause.
- v4 reads only the stability setting. SSML `<break>` is disabled. Audio tags like `[laughs]` are performed, so use them sparingly.

**Pre-made audio (`eleven_v4`)**
- Generate these offline and cache them: round intros, "Your turn!", praise, animal-sound reactions, fallback lines and any story. Never generate a story live.
- Keep 5 or 6 earcon variants ("Hmmm...", "Achha!") that play the instant the button is released, so the child hears grandma in under 0.3 s.

**Grandma's clone**
- Instant and Professional clones both work with v4 Turbo. A clone made before v4 launched must be retrained for v4: in the ElevenLabs voice list, hover over the voice and click the plus. Check that grandma's clone is v4-ready.
- An Instant clone needs 1 to 2 minutes of clean audio.

**Audio format**
- Use one sample rate end to end, 16 kHz or 24 kHz. ElatoAI's firmware expects 24 kHz output. Never resample in two places.

**Latency (R2 budget, measure every hop)**
- Per hop:
  - STT commit to transcript: 150 to 250 ms.
  - Brain first token: 300 to 600 ms with thinking off (unverified).
  - First sentence: 40 to 100 ms.
  - TTS first audio: 90 to 140 ms.
  - Network to and from the toy, plus a 60 to 120 ms playback buffer.
- Total to the first real word: about 1.0 to 1.6 s. Perceived: under 0.3 s, thanks to the earcon.
- Payoff order:
  1. No thinking latency.
  2. Earcon.
  3. Pre-made audio.
  4. Flush per sentence.
  5. Warm sockets: one TTS socket per session, HTTP keep-alive to the brain, STT opened on press.
  6. Short replies.
  7. Small playback buffer.
- Optional: start the brain on the latest partial transcript when a press lasts over 1.5 s.

**Barge-in (press while grandma talks)**
- The toy or stand-in stops playback locally at once.
- The relay aborts the brain stream, closes and reopens the TTS socket, and drops queued audio.
- History records only what grandma actually said.

## 2. Game moments (R2) — Core

**Animal-sound imitation ("Roar like a lion!")**
- Skip STT. While the button is held, the relay measures loudness (RMS) on 20 ms frames, taking the noise floor from the first 200 ms.
- A sound counts when it totals at least 300 ms above floor + 12 dB. Loudness and duration give a roar score.
- Reply with a pre-made reaction and the projector cue. Then add a synthetic turn such as `[child roared for 1.4 s, loud]`, so the brain keeps context.
- Nothing heard: "I couldn't hear you! Hold my paw and roar again!"

**Projector sync**
- The brain calls a tool `show_animal(name)`. Backup: an inline marker such as `<<lion>>`, stripped before TTS.
- The cue fires with the next sentence. When that sentence's first audio goes out, broadcast `{animal, delay_ms}`, where delay_ms is the playback buffer plus one-way network (about 250 ms).
- Channel: Supabase Realtime broadcast `room:<deviceId>`. The projector page preloads every clip when it loads.

**Live latency meter (a strong demo visual)**
- The toy or stand-in measures release to first sound played on its own clock, so no clock sync is needed. The relay adds per-hop timestamps.
- Broadcast on `metrics:<deviceId>`. The projector corner shows:
  - "Grandma replied in 1.12 s".
  - A stacked bar: STT, Brain, Voice, Network.
  - A rolling median.
  - "perceived: 0.04 s".

## 3. Relay host — Option
The relay is one long-lived process per session. It holds three sockets (toy, STT, TTS) plus the brain stream. R2 put it on Fly.io and advised keeping it off Vercel; Fly.io is now ruled out.
- **Vercel WebSocket functions** (generally available since 20 Oct 2026, need Fluid compute).
  - A connection closes at the function's max duration: 300 s by default, up to 800 s on Pro, 1,800 s in beta.
  - Every client needs reconnect logic, and a reconnect can land on another instance with no in-memory state.
  - So persist session state (history tail, game state) to Supabase on every turn and rehydrate on reconnect.
- **Laptop relay** (our note, not from the reports). A local Node process on the demo table with no duration cap. The toy reaches it over the same hotspot. It depends on the laptop staying up.

## 4. The agent: one per child, five files (R3, cut to demo level) — Core

| File | Holds | Written by |
|---|---|---|
| persona.md (to confirm) | Who grandma is, tone, house rules | Us, static |
| brain.md | The child: name, age, what they know, pronunciations, what works, 2 to 3 line summaries of recent sessions | The end-of-session step only |
| planner.md | This session's plan: letters, detours, difficulty | Replan on a guidance change, or nightly |
| heartbeat.md | Scheduled jobs: tonight's digest, a good-night line at quiet hours. Silent when nothing is due | Us |
| parent.md | Guidance: focus, avoid, tone, keyword responses, quiet hours | The parent site only |

**How the files are used**
- **Session brief:** at session start, load the files once into the brain's system prompt, persona first and then the child files, about 1.5k to 2.5k tokens. Nothing is looked up during a turn. Per-turn state (round letter, scores, referee verdict) goes last, in the user turn.
- **One writer per file:** live grandma never edits her own files. After each session, one step appends a short summary to brain.md. This powers "Yesterday you..." and "What did we do today?".
- **Guidance flow:** a guidance change triggers a replan. The new planner version is swapped in at the next turn boundary, and grandma confirms aloud. Keep every version, so the parent site can show a "what changed" diff.
- **Cheap, visible learning (Option): pronunciation memory.**
  - The referee fuzzy-matches "jiraf" to giraffe.
  - A line goes into brain.md, and "jiraf" joins tomorrow's keyterms.
  - Grandma accepts it and models "giraffe".

**House rules in persona.md (product behaviour)**
- Says she is an AI if asked.
- Speaks in one or two short sentences, using words a 5-year-old knows.
- Keeps no secrets from parents: comforts the child, then suggests telling Mummy or Papa.
- Never says she will be lonely or sad when the child leaves.
- Ends by handing the child back to the family ("Go show Mumma your lion roar!").
- Steers back to the game when unsure.
- Follows parent guidance.

**Storage**
- Supabase holds one table for the files (child, file, content, version, updated) plus Realtime broadcast.
- Seed 3 to 5 days of history for the demo child, so Tonight and the map look alive.

## 5. Parent website (R4, lean)
**Principle:** guidance, not control. The loop is: guide, see it take effect, connect.

**Look and stack**
- Mobile web, 390 px first, with four tabs: Tonight, Ask, Guide, Grow.
- Warm off-white with one marigold accent, rounded cards, body text of at least 16 px.
- Noto Sans Devanagari for Hindi, with bilingual labels.
- Next.js, Tailwind and shadcn/ui; Motion for arrivals; react-force-graph-2d for the map.

**Tonight (Core)**
- A 3-line summary.
- 3 bedtime conversation starters, each tied to a real moment from today.
- 1 highlight and "New today" chips.
- Never usage-time charts, scores or comparisons with other children.

**Guide (Core): Say it, See it, Hear it**
- **Say it:**
  - A natural-language box.
  - Preset chips: Focus on letters, More places in India, Animal sounds, Calm bedtime, No scary stories, Speak more Hindi.
  - A tone slider, play windows and quiet hours.
- **See it:**
  - The brain parses the text into rule cards using strict JSON: `focus[]`, `avoid[]`, `keyword_responses[{triggers[], response, notify_parent}]`, `tone`, `windows[]`, `quiet_hours`.
  - Then it shows a "Grandma will now..." preview.
- **Hear it:**
  - Save, then a progress strip runs: Saved, Updating plan, Ready.
  - Grandma says the confirmation aloud.

**Ask (Option)**
- One-sentence answer, 2 to 3 bullets, and evidence chips that point to real moments.
- Says so when evidence is thin, and never gives a diagnosis.

**Grow (Option)**
- A knowledge map shown as clusters: Animals, Places, Letters, Sounds.
- Tapping a cluster opens a small graph of up to 25 nodes. New nodes drop in live during play.

**Soft alert (Option)**
- Rare, calm and actionable: "Worth knowing: ... Grandma comforted him. Try tonight: ...".
- Shown as an in-page Realtime toast, with phone push through a Telegram bot (free, quick to set up, deep-link pairing).
- WhatsApp's test number is only a showpiece:
  - It reaches verified recipients only.
  - Templates can take up to 24 h to approve.
  - Free-form messages work only within 24 h of the user writing first.

**Other parent-side notes**
- Connection extras, ranked by R4:
  1. Bedtime starters.
  2. A parent voice note that grandma delivers.
  3. A good-night line at quiet hours.
  4. The child's roar replayed to the parent.
- Onboarding (Option): do the voice clone and toy pairing before the demo. Keep "Hear Grandma say Aarav's name" as the emotional moment.
- Realtime free-plan limits are 200 concurrent connections and 100 messages per second, which is plenty.

## 6. Switching the brain to Claude — Later
- Model `claude-haiku-5-5`. Thinking is adaptive and on by default, which is the main latency risk: R2 cites 5.8 s to the first answer token at low effort with thinking on. Use low effort with thinking off, then measure the first token on 20 real turns (**Verify**).
- Prompt caching:
  - A stable prefix with `cache_control`: the persona block, then the child-files block. Per-turn state goes last.
  - The minimum cacheable prompt is 512 tokens.
  - Warm the cache with a 1-token call at session start.
- Call the native Messages API. Anthropic's OpenAI-compatible endpoint drops prompt caching.
- Re-run the latency test after the switch, because Kimi numbers do not carry over. The Anthropic credit fix is open in OPEN.md.
- Indian languages: ElevenLabs v4 covers Hindi (`language_code=hi`); pre-generate Hindi stories with `eleven_v4`. Sarvam translation wraps around this on the buildathon day.

## 7. The toy, as software sees it (R1) — input to the toy contract
- **Link:**
  - The toy talks to the relay over a secure WebSocket, opened at boot and kept alive. ElatoAI's cold start is 3 to 4 s, so never connect on press.
  - Opus audio, 16 kHz mono, 20 ms frames, plus JSON control messages.
- **Messages (R2 draft):**
  - Toy to relay: `ptt_start` with frames, `ptt_end` with the release time, `playback_started` with the play time, and a `latency` report.
  - Relay to toy: audio frames and state cues.
- **Half-duplex push-to-talk:** the mic is live only while the paw is held, and the speaker plays only after release, so no echo cancellation is needed. Earcons are stored in the toy's flash.
- **Eye states:** connecting, idle, listening, thinking, speaking, offline. On a network error, a local "Nani is having a little nap" clip plays.
- **Network:** our own phone hotspot on 2.4 GHz, because the ESP32-S3 has no 5 GHz.
- **Firmware:** a fork of ElatoAI (MIT). Its device protocol may differ from ours; the toy contract decides which side adapts.
- **Toy stand-in** (our note, not from the reports): a web page that acts as the toy and speaks the same contract. It has a hold-to-talk button, mic, speaker, earcons and eye states, so the whole product runs and is tested without hardware.

## 8. Projector home base (R1) — Core
- The /home-base page runs in kiosk mode on a Portronics Beem 440 (Android 11) with Fully Kiosk Browser Plus.
  - Fully Kiosk settings: start URL; autoplay on; screen always on; screensaver off; auto-reload on reconnect.
  - Turn Android auto-update off.
- Fallback: a laptop running Chrome with `--kiosk --autoplay-policy=no-user-gesture-required`, connected to the projector or a TV over HDMI.
- Preload every clip at page load. If unmuted `play()` is rejected, play the video muted and let the toy make the animal sound.
- The projector needs a dark room: ask for a dim corner and keep the image small, 60 to 80 cm.

## 9. Fallbacks (R2) — Option
- **ElevenAgents voice fallback:** an agent with grandma's clone on `eleven_v4_turbo`, turn eagerness set to Eager, and a Custom LLM pointing at our brain endpoint (OpenAI-compatible SSE).
  - It has no manual end of turn. Send our own Scribe transcript as a `user_message` and stop forwarding mic audio.
  - It costs about $0.08 per minute.
- **Last resort:** a recorded 60-second video of a good run.

## 10. Cut
- R3's five-agent team, its Guardian classifier and its full memory vault: bi-temporal knowledge graph, Leitner and BKT mastery, pgvector, job queue, pg_cron.
- Fly.io and region probes, Bedrock, LiveKit, Pipecat and WebRTC.
- Speech-to-speech models: they cannot pair our brain with grandma's voice.
- OpenClaw or any claw runtime, and memory frameworks such as Letta, Zep and Mem0.
- Security hardening, auth and RLS, consent and compliance work, SMS, web push, a native app.
- Sarvam, until the buildathon day.

## 11. Demo beats suggested by the research (input for the game walkthrough)
1. Name, Place, Animal, Thing with a detour: place, animal, sound, projector clip, child imitates. The map grows live on the parent's phone, and the latency meter runs in the projector corner.
2. The session opens with "Yesterday you..." (demo-level memory).
3. The parent types guidance on the phone and rule cards appear. They tap Save, the toy confirms aloud, and the next turn reflects the change.
4. The child says something worrying ("I'm scared of the dark"). Grandma comforts them, and a soft alert reaches the parent with a suggested response.
5. The session ends and Tonight appears with 3 bedtime starters. Optional: Ask with evidence chips, and the "What Grandma knows" diff.
