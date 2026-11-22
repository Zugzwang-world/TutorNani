# GUIDANCE (from PLAN.md Part B)

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

