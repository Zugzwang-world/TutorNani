# Toy contract · what the hardware toy must speak (2026-11-17)

The web stand-in `/toy` already does all of this. A real toy (ESP32-S3) or a relay in front of it can replace `/toy` by doing the same three things:
1. Send each child turn to `POST /api/turn` and play the streamed reply.
2. Listen on the Realtime channel `toy:aarav`.
3. Post broadcasts on `wall:aarav` so the projector follows.

Base URL: `https://tutor-grandma.vercel.app`. Types live in `apps/web/lib/types.ts`. Only the Coordinator changes this contract.

## 1. A child turn: `POST /api/turn`
Request: `multipart/form-data`
| Field | Value |
|---|---|
| `audio` | The recorded speech (webm/opus, mp4/aac, wav or mp3; 16 kHz mono PCM WAV is fine). Recording starts when the paw is pressed and stops when it is released. |
| `text` | Instead of `audio`, for tests: what the child said. Skips speech-to-text. |
| `sessionId` | Any string, one per power-on. |
| `board` | JSON `BoardState`: what the wall shows now, e.g. `{"spell":{"word":"MANGO","gap":1,"tiles":["M","S","T"],"filled":false}}` or `{}`. |
| `lastEvent` | JSON `NaniEvent` or `null`: the last thing Nani did that was not a reply, e.g. a reminder `{"kind":"reminder","text":"Aarav beta, paani pi lo!","jobKey":"…","at":"<ISO>"}`. |
| `clockOffsetMs` | The presenter's demo clock offset (read `demo_state.clock_offset_ms`, or the latest `toy:aarav` `clock` event). `0` = real time. |

Response: `application/x-ndjson`, streamed, one JSON object per line, in this order:
1. `{"t":"heard","text":"M se mango!"}`: the transcript. An empty `text` is followed by the `not_heard` fallback.
2. `{"t":"say","i":0,"text":"Wah, Aarav!","cues":[…],"audio":"<base64 mp3>"}`, then i = 1, 2, …: one sentence each, strictly in order.
   - Play `audio` (mp3, 44.1 kHz, 64 kbps, mono) as soon as it arrives, back to back.
   - At the start of each sentence, send its `cues` to the wall (section 3).
   - `audio` can be `""` for a cue-only sentence.
3. `{"t":"fallback","id":"not_heard"|"voice_failed"|"slow_brain"|"offline"}`: play that pre-made line (`/audio/<id>.mp3`).
4. `{"t":"done","ms":{"stt":…,"brainFirst":…,"voiceFirst":…,"total":…}}`: always last; `-1` marks a step that did not run.

Timing (production, 17 Nov): the first `say` arrives 1.2 to 2.7 s after the request. Bridge the gap on the toy itself:
- the instant a press ends, play a reaction (`/audio/reaction_*.mp3`)
- after 1.2 s without voice, a learning filler (`/audio/filler_*.mp3`)
- after 4 s, `song_snippet` or `filler_wait_chashma`
- after 8 s, the `slow_brain` line

A press while Nani speaks (barge-in) stops playback, cancels the request and starts recording.

Cue types (`Cue`): `show`, `spell`, `tile`, `count`, `choices`, `cheer`, `sound` (play `/audio/animal_<name>.mp3` on the toy), `song` (play `/audio/song.mp3`), `call` (start a call, section 4).

The pre-made audio manifest is `content/audio.json`: ids, files under `/audio/`, kinds and durations.

## 2. Channel `toy:aarav` (Supabase Realtime broadcast; publishable key)
| Event | Payload | The toy should |
|---|---|---|
| `reset` | `{}` | Reload or reset its state. |
| `clock` | `{offsetMs}` | Use the new demo clock offset. |
| `fire_next_job` | `{}` | Fire the next routine job now. Routine jobs are lines in heartbeat.md; see `lib/jobs.ts` and `app/toy/use-routine.ts`. |
| `call` | `{callId, state: "ringing"\|"open"\|"ended", who}` | Ringing or open: call mode (the paw records call clips). Ended: back to talk. |
| `clip` | `{callId, from: "toy"\|"parent", url, sender}` | `from: "parent"`: play `url` (16 kHz WAV) at once. |

Routine jobs fire on the toy: `POST /api/event` with `{bot:"routine", text, turn:{kind:"job", meta:{jobKey, dueAt}}}`. If the reply has `duplicate:true`, another device already fired it. Otherwise play the line (`POST /api/say {text}` returns `{url}`).

## 3. Channel `wall:aarav` (the toy sends, the projector listens)
`cue {cue}` (one per cue, at the start of its sentence) · `thinking {on}` (on at release, off at the first sentence) · `speaking {on}` · `reset {}`.

## 4. Calls (walkie-talkie)
- Start: `POST /api/call {"action":"start","who":"mumma"}` → `{callId}`. Join and end: `{"action":"join"|"end","callId","sender"}`.
- A clip: `POST /api/clip`, multipart `file` (16 kHz mono WAV recommended), `callId`, `from: "toy"`, `sender: "Aarav"`. The parent's phone plays it at once. Release to heard is about 1 s.
- The call ends after 2 minutes with no clip, or when either side ends it.
