# REFINE.md · Tutor Grandma refinement run

For the Coordinator. The founder is asleep for the whole run. Read the Summary and Part A fully. Builders read only their item in Part B. Part C is the stage script.

## Summary
- **Goal:** the stage script in Part C runs cleanly on production from start to finish, and Nani holds up when anyone says anything.
- **Work:** R1 to R9 in Part B. Size: one L run, in waves.
- **Not in this run:** switching the brain to Claude, hands-free talking, new spoken fillers, grandma's voice clone, Sarvam, hardware and firmware, and the toy contract's message format.
- **Usage:** read the weekly figure at the start (`mcp__ccd_session_mgmt__get_usage`). Stop at 6 points above it or at 15% weekly, whichever comes first.
- **Never ask the founder anything.** Decide, log one line in OPEN.md, continue.

---

## Part A · Run

### A1. Rules for this run (they override CLAUDE.md where they differ)
- The founder is asleep: never ask, never wait for a confirmation. Pick the best option, log one line in OPEN.md (date · what · why), continue.
- The brain stays Kimi k2.6 (`brain.provider` = kimi). Never switch it. Never send parallel brain requests.
- Nani's voice stays Dulari Didi. New audio uses scripts/audio/generate.mjs and the model ids in LOOKUPS.md.
- Shared contracts change only in Wave 0, by you, before builders start: content/demo.config.json, the wall markers, the heartbeat job lines and the progress data.
- Builders run side by side only when they touch different folders or different files. The waves below are split that way. If two builders need the same file, run them one after the other.
- Models: the CLAUDE.md roster. You may use Sonnet 5.5 at high effort for R2 and R5 to save usage, as on the last run. R1, R3, R4, R6 and R9 are the demo path. R7's look matters as much as the demo path: give it a strong builder and one design review.
- /toy, /home-base, / and /presenter keep working on their own. Real phones, the projector and the hardware track need them.
- Done means merged to main and checked live on production. Builders open their own Playwright context. Commit pnpm-lock.yaml with any package change. The gotchas in HANDOFF.md apply.
- Log the run in docs/plan/RUNLOG.md under "Refinement run": start, usage, each wave, stop.

### A2. Wave 0 (you, in order, each size S)
1. Save this file as docs/plan/REFINE.md (from the attachment or ~/Downloads/REFINE.md). Start the RUNLOG section. Commit to main.
2. Run /preflight. Fix .claude/commands/preflight.md: a 404 (PGRST205) on agent_files now means something is broken. Remove that line from OPEN.md.
3. R8.1: shells and money out, the counting rule in.
4. Shared contracts:
   - a. content/demo.config.json: the `bubbles` list from R2.4. The phone's chip row uses the same lines.
   - b. Wall markers (lib/markers.ts, lib/types.ts and the marker list in persona.md): `[[show EMOJI Word | hindi | EMOJI EMOJI]]`, where everything after the first `|` is optional, and `[[count EMOJI n both]]` or `[[count EMOJI a+b both]]` for counting in Hindi and English. The old forms keep working.
   - c. Job lines (lib/jobs.ts, with tests in lib/routine/routine.test.ts): R4.1.
   - d. Progress data: the `progress_days` table (R7.2), a migration in supabase/migrations, the types, and /api/reset restoring the progress seed.
5. Scout, answers into docs/plan/LOOKUPS.md: the current versions of the chart and animation packages R5 and R7 may use (for example @nivo/calendar and motion) and whether they work with React 19.3 and Next.js 16.4; whether the music model used for the song suits a short instrumental loop.
6. Advisor: one review of the waves below against this file. Adjust, log, go.

### A3. Waves
- **Wave 1, side by side:**
  - R1 one screen and tap to talk (expert): apps/web/app/stage (new), apps/web/app/toy.
  - R2 idea bubbles (builder): apps/web/components/chat/bubbles (new), plus composer.tsx and guidance-chat.tsx.
  - R5 agent profiles (builder): apps/web/components/chat/profile (new), plus message-list.tsx and chat-header.tsx.
  - R6 the game inside anything (expert or builder): content/seed.json (persona and planner), apps/web/app/api/turn/prompt.ts, apps/web/components/wall.
  - R7 progress report (builder): apps/web/components/report (new), apps/web/app/api/progress (new), scripts/progress (new), content/progress-seed.json. Its entry points in chat-header.tsx and message-list.tsx go in after R5 merges, since R5 edits the same files.
- **Wave 2, after R1 merges (they build on its screen and its talk loop):**
  - R3 waiting (expert): apps/web/app/toy/fillers.ts, apps/web/app/toy/talk-loop.ts, content/audio.json, scripts/audio/sounds.json.
  - R4 reminders on the real clock (builder): apps/web/lib/routine, apps/web/app/toy/use-routine.ts, apps/web/app/presenter, the Routine part of apps/web/lib/agents/prompt.ts, and the stage's file strip and jobs board.
- **Wave 3:** R9 (the script self-test and the off-script round), fixes, R8.3 docs, then reset.

### A4. Done checks (★), all on production
1. **Script:** Part C steps 1 to 15 through the self-test's script mode, 4 full runs. Every step passes in at least 3 of the 4. A Kimi stall counts only if an immediate repeat of the same line also fails.
2. **Bridge:** "Nani, raat ko Papa aayenge!" gets a question whose answer is chand (or another word for today's letter) in at least 3 of 4 runs, and "Chand!" gets the Moon card and then the spelling board.
3. **Reminders:** after "Remind him to drink water now, and then every 2 hours", Routine replies and Nani reminds Aarav within about 2 s of that reply. +2 h fires exactly one more reminder. The jobs board shows the countdown before and after.
4. **Bubbles:** every bubble reaches exactly the agents it shows.
5. **Off-script round:** at least 27 of 30 pass (R9.2).
6. **Stage:** at 1920×1080 and 1440×900 in Chrome, nothing overlaps, and the bubbles, chat and wall read well from 3 m away (screenshots).
7. **Report:** Today, This week, This month and All time all render. After a script run, Today shows that run's real words and moments.
8. **Tap to talk:** on /stage and /toy, one tap starts and the next sends; it sends by itself at 15 s; a tap while Nani speaks stops her.
9. **Waiting:** no spoken filler plays; the music starts only when Nani is late and fades within 300 ms of her first sentence; the median time to Nani's first sentence is no worse than the last self-test (2.3 s).

### A5. End of run
- NOW.md: what changed, the links (with /stage), timings, the self-test results, known issues. DEMO.md: Part C with the links. OPEN.md: questions for the founder. DECISIONS.md: one line per decision. HANDOFF.md.
- Reset production to the seed: `curl -X POST https://tutor-nani.vercel.app/api/reset`.
- RUNLOG: stop time and usage.

---

## Part B · The work

### R1 · One screen, and tap to talk (★)
A new page, /stage, split into two halves at 16:9.
- **Left, Nani's world:** the wall (components/wall/Wall.tsx) filling the half, Nani's face (app/toy/face.tsx) and the talk button docked at the bottom left, and a one-line caption: what Aarav said, then what Nani is saying.
- **Right, the parents' world:** the group chat column (about 420 px) in the middle of the half, R2's bubbles on both sides of it, and R4's file strip and jobs board across the top.
- **Presenter drawer:** hidden. It opens with Alt+P (Option on a Mac) or a small handle in a corner. It holds Reset (with R8.2's warm-up), +30 min, +2 h, Real time, Fire next job, Evening brief, Timings and the turns table. Shortcuts work only when no text box has focus: Alt+2 (+2 h), Alt+F (fire next job), Alt+R (reset).
- **Who is typing:** the stage's chat sends as Mumma unless switched with a small Mumma/Papa switch in its header. Bubbles always send as their own parent. No "Who's this?" prompt on the stage.
- **One audio path:** the toy core owns every sound on the stage. The wall on the stage plays nothing of its own, so no sound plays twice. Mind the supabase-js rule noted in use-routine.ts: one channel object per topic.
- **Tap to talk, on /stage and /toy:** one tap (or the space bar) starts listening and the next tap sends. It sends by itself after 15 s. A tap while Nani speaks stops her (barge-in, as now). The call's walkie-talkie uses the same taps. Labels: "Tap to talk" and "Listening… tap to send". The toy contract does not change: the first tap is `ptt_start`, the second is `ptt_end`.
- **Check:** 1920×1080 and 1440×900 in Chrome; the first tap unlocks sound and the mic.

### R2 · Idea bubbles
- On wide screens, illustrated bubbles float on both sides of the chat column, on / and on /stage, and replace the "Try saying" chip row. They size to the chat's container, not the window, so they fit in the stage's right half. Phones keep the chip row with the same lines.
- **A bubble is a small infographic, never plain text:** a scene made in code (an emoji composition on a soft gradient, such as 👨‍💼🚗🏠 for "On the way home"), the parent's avatar and name, the situation in two to four words, the line it sends, and small avatars of the agents it reaches with their files (⏰ heartbeat.md). An optional `image` field lets drawn art replace the scene later.
- **Motion:** a gentle float, a lift and a wobble on hover, and a soft glow on the next bubble in the stage script. prefers-reduced-motion stops the floating.
- **Click:** the bubble flies into the chat and posts as its parent. A new bubble drifts into its place, and used ones go to the end of the queue.
- **R2.4 · The list** (written in Wave 0; Step is the Part C step, blank if none):

| Parent | Situation | Line | Agents | Step |
|---|---|---|---|---|
| Mumma | At work | Remind him to drink water now, and then every 2 hours | ⏰ Routine | 6 |
| Mumma | Before dinner | When you count, count in Hindi and English both | 🏠 House rules | 9 |
| Papa | At the market | I'm bringing mangoes for him tonight | 📚 Lessons, 📔 Memory | 11 |
| Papa | On the way home | Coming home soon. What should I talk to him about? | 📔 Memory | 14 |
| Papa | In a meeting | Call him in 2 minutes, I want to say hi | ⏰ Routine | |
| Mumma | Bedtime | Every night at 8:30, story time | ⏰ Routine | |
| Mumma | Bedtime | No scary animals at bedtime | 🏠 House rules | |
| Papa | Weekend | Speak a bit more Hindi with him | 🏠 House rules | |
| Mumma | This week | He's crazy about cars this week | 📚 Lessons | |
| Mumma | Tough morning | He's a bit sad today, be extra gentle | 📚 Lessons, 📔 Memory, 🏠 House rules | |
| Papa | Evening | What did he learn today? | 📔 Memory | |
| Mumma | Sunday | How was his week? | 📔 Memory | |
| Papa | Lunch break | Did he drink water today? | 📔 Memory | |
| Mumma | Rainy day | Teach him the colours of the rainbow | 📚 Lessons | |

If the sorter routes a bubble differently, fix whichever is wrong: the routing or the label.

### R3 · Waiting (★)
- The spoken learning fillers and the chashma line stop playing. Keep their files; just stop picking them.
- The instant reaction at the send tap stays, but only the calm ones: reaction_hmm, reaction_achha, reaction_achha_achha and reaction_haanji. reaction_ooh and reaction_oho leave the pick list, because they sound wrong after a sad or scared line.
- **Music:** make one soft instrumental loop with no words, id `wait_music`, kind `music`. Warm and slow, for a 5-year-old (for example soft marimba with light tabla), 8 to 12 s, looping without a seam.
- Play it only when Nani is really late: no first sentence 2.5 s after the send tap. Fade it in over 300 ms, about 12 dB under Nani. Fade it out over 250 ms the moment her first sentence is ready, wherever the music is. The wall keeps its thinking scene.
- **Give-up line:** keep the 8 s give-up, but `slow_brain` now asks him to say it again, for example "Arre, Nani ka dhyaan bhatak gaya! Ek baar phir bolo, beta?", in Nani's voice (eleven_v4), under the same id.
- Log in SELFTEST.md how often the music played and the median time to Nani's first sentence.

### R4 · Reminders on the real clock (★)
- **R4.1 · Job lines** (Wave 0):
  - Every current form keeps working.
  - New: `every N minutes|hours from HH:MM[:SS]` with no end. It is due at the start time, then every N, until it is removed. "Now, and then every 2 hours" is `every 2 hours from <now>`, so the first reminder is due at once.
  - New: seconds in one-off times, `once on DD Mon at HH:MM:SS`, for "in 30 seconds" or "in 2 minutes". The Routine agent turns relative times into absolute ones.
  - `once at HH:MM` with no date means today only (NOW.md issue 4). The Routine agent always writes a date on one-off jobs.
- **R4.2 · The Routine agent** (lib/agents/prompt.ts, the Routine part only): the user turn carries the demo clock's date and time (HH:MM:SS); keep it out of the system prompt so caching holds. "Now" is due now. "In N minutes" becomes an absolute time. "Every 2 hours" with no start runs from now, with no end. "At 7" is 19:00 today, or tomorrow if that has passed. Remove the old rule that "every 2 hours" means 10:00 to 18:00, and its example. The reply says exactly when, for example "Done! Nani will remind him right now, and every 2 hours after that 💧".
- **R4.3 · Firing:** check every second and fire each due time once (fireId, as now). A due job waits until Nani is idle (not listening, thinking or speaking) and no call is open, then fires within 1 s. A "now" job fires within about 2 s of Routine's reply. If several pages are open, the server's fire-once key stops doubles.
- **R4.4 · Presenter:** keep +30 min, +2 h, Real time and Fire next job. Remove Jump to 12:00, 19:00 and 20:30. A +2 h skip fires the job due at +2 h exactly once, never a burst.
- **R4.5 · On the stage,** across the top of the right half:
  - **File strip:** five chips, one per file (👵 persona.md, ⏰ heartbeat.md, 🏠 parent.md, 📚 planner.md, 📔 brain.md), each with its version number. A new version makes its chip pulse and shows a toast for about 4 s, for example "⏰ heartbeat.md v5 · Routine added: every 2 hours from 01:16". A tap opens that agent's profile (R5). A 📈 chip opens the report (R7).
  - **Jobs board:** each job as a card with its icon, text, who set it, next due time and a live countdown (hh:mm:ss), under the demo clock, so a +2 h skip visibly jumps. A fired job flashes "✓ fired at 03:16".

### R5 · Agent profiles
- **Open:** tap any agent's avatar or name in the chat, or a file chip on the stage. It opens a full-screen overlay. ✕, Esc or a swipe down closes it, and the chat stays where it was.
- **Sections,** as infographics made in code (SVG and CSS, light animation, no outside images):
  1. Who I am: avatar, name, file and one line ("I keep Aarav's routine: reminders, calls and bedtime").
  2. How I work: an animated three-step flow, parents say it → I write it in my file → Nani does it, with one real example.
  3. What I listen for: three or four icon tiles (for Routine: a time, a repeat, a call, a stop).
  4. Examples: two or three before → after cards from real lines (the seed and today).
  5. My file now: the file rendered, with today's new lines highlighted.
  6. Versions: a timeline (version, who, when, what changed). Tap one for its diff, reusing the what-changed view.
- **Live:** a profile updates when its file gets a new version.
- **Five profiles:** 👵 Nani (persona.md), ⏰ Routine (heartbeat.md), 🏠 House rules (parent.md), 📚 Lessons (planner.md) and 📔 Memory (brain.md). Their words live in content/agents.json.

### R6 · Nani plays the game inside anything he says, and answers anything (★)
- **R6.1 · The bridge** (a new "How I play" section in persona.md, plus app/api/turn/prompt.ts): when Aarav says something outside the game, Nani finds a word linked to it that starts with today's letter, asks one short question whose answer is that word, then teaches it: the English word, "M for Moon", one simple true fact and a wall card, then the spelling board when it fits. One hop, warm, in his words, never forced. Examples for persona.md:
  - Aarav: "Raat ko Papa aayenge!" · Nani: "Achha! Raat ko aasmaan mein aur kaun aata hai?" · Aarav: "Chand!" · Nani: "Haan! Chand ko English mein Moon kehte hain. M for Moon! [[show 🌙 Moon | chand | ⭐]]"
  - Aarav: "Maine doodh piya." · Nani: "Shabaash! Doodh ko English mein Milk kehte hain. M for Milk! [[show 🥛 Milk | doodh]]"
- **R6.2 · Bridge words** (planner.md, under "## Today"): one line of today's words with their Hindi: Moon (chand), Mango (aam), Monkey (bandar), Milk (doodh), Mouse (chooha), Mountain (pahaad), Mirror (sheesha), Market (bazaar), Music (gaana), Mummy. Each turn also sends them, Hindi included, as speech-to-text keyterms.
- **R6.3 · Any question:** one short true fact in a grandma's words for a 5-year-old (only facts she is sure of), then a question back to play or a bridge to today's letter. Grown-up, scary or rude questions get a gentle, child-safe answer and a turn back to play. "Are you ChatGPT?" gets "I'm an AI Nani". Every reply puts one thing on the wall.
- **R6.4 · The show card** (components/wall/scenes.tsx and wall.css): a big animated emoji, the English word in letter tiles with its first letter lit, the Hindi word under it, and up to two small supporting emojis drifting nearby. The old `[[show EMOJI Word]]` still works.
- **R6.5 · The count card:** with `both`, every number shows its Hindi and English names ("ek · one").

### R7 · Progress report: today, this week, this month, all time (★ look)
- **R7.1 · What it is:** an interactive, full-screen report that a parent reads and plays with, opened from the chat. It follows the spirit of NCERT's Holistic Progress Card for the Foundational Stage: stories of growth, not scores. No scores, grades, comparisons with other children or screen-time charts.
- **R7.2 · Data:** one new table, `progress_days` (child_id, day, data jsonb; primary key child_id + day). `data` holds: words [{en, hi, emoji, area, quote, firstSaid}], letters {learnt, working}, counting {upTo}, areas {language, numbers, feelings, culture}, moods [{time, feeling: happy|excited|calm|tired|upset|scared|sad, what, helped}], tricky [{what, tip}], routine {water: {asked, done}, calls, stories}, highlights [{text, quote}] and starters [three lines].
  - **History:** 8 weeks for Aarav, consistent with brain.md (14 Nov: L for Lion and the roar for Mumma; 15 Nov: K for Kangaroo and the ladoo for Riya; 16 Nov: colours and "Thank you, Nani!"; letters A to L learnt before today), a believable mix of days, and two or three upset moments, each with what helped. Written once by scripts/progress/seed.mjs into content/progress-seed.json, committed, and restored by /api/reset.
  - **Today:** built from today's turns and chat with one brain call when the report opens or the evening brief runs, cached for 60 s, in the same shape. Reuse the moments from lib/agents/turn-notes.ts where they exist. A quiet day says so honestly.
- **R7.3 · Views:** Today · This week · This month · All time, with an animated switch between them.
- **R7.4 · Sections,** each one a visual, never a table:
  1. In three lines: plain words for the period, plus three conversation starters tied to real moments.
  2. New words: a word garden. Each word shows its emoji, English and Hindi; tap one for when he first said it and his own words.
  3. Learning areas: the four areas in planner.md (language and letters, numbers and thinking, feelings and manners, songs and culture) as a radial chart; an A to Z ring with the learnt letters lit and the current one glowing; how far he counts, from 1 to 10.
  4. Days: a GitHub-style calendar of play and new words. Tap a day for its three lines.
  5. Feelings: a mood-weather strip (☀️ ⛅ 🌧️) across the period. Tap a moment for what happened and what helped. Moments only, never a tally.
  6. Tricky spots: what he is working on (M vs N, counting past 7), each with one thing to try tonight.
  7. Routine: water reminders answered, calls with Mumma and Papa, and story nights, as small icon rows.
  8. Highlights: the best moments as cards (the roar, sharing with Riya).
- **R7.5 · Where it opens:** a "📈 Aarav's progress" card under Memory's replies to "What should I talk to him about?", "How was his week?" and "What did he learn today?"; a 📈 button in the chat header; and the 📈 chip on the stage. One column on a phone, an overlay on the stage.
- **R7.6 · Build:** load it lazily. Charts come from a maintained React chart kit (for example Nivo's calendar) or hand-made SVG, whichever is lighter; animation from CSS or the motion package (versions from LOOKUPS.md). Use the app's warm off-white and marigold.
- **R7.7 · Honesty:** DEMO.md tells the presenter to say that the earlier weeks are sample history and today fills in live.

### R8 · Script content and clean-up (you)
- **R8.1 · Shells and money out** (Wave 0): the chip in content/demo.config.json, the example in lib/agents/prompt.ts, the rule in app/api/turn/prompt.ts, lib/agents/turn-notes.ts, the regex in app/toy/fillers.ts, the wall's demo loop in components/wall/Wall.tsx, scripts/selftest/selftest.py and DEMO.md. filler_numbers_5 goes with R3. The counting rule takes their place as the House rules example: Mumma says "When you count, count in Hindi and English both" → parent.md gets "- <date> · Mumma: count in Hindi and English both" → Nani's counts say both names and use `[[count EMOJI n both]]` → House rules reports it the first time.
- **R8.2 · Reset warm-up:** after restoring the seed, the progress seed and the clock, Reset makes one tiny brain call, one tiny voice call and one Supabase read, so the first real answer isn't the slowest, then shows "Ready".
- **R8.3 · Docs** (Wave 3): DEMO.md is Part C with the links. NOW.md, OPEN.md, DECISIONS.md and HANDOFF.md as in A5.
- **R8.4 · For later, one line in OPEN.md:** the Claude path in lib/brain.ts sends neither `thinking: {type: "disabled"}` nor `output_config: {effort: "low"}`, so Haiku 5.5 would run with thinking on. Fix it and measure before any switch.

### R9 · Self-test for the script (★, Wave 3)
- **R9.1 · Script mode:** `selftest.py script` runs Part C steps 1 to 15 in order on production: Aarav's lines (and the roar) as voice turns with the test voices, bubbles as chat messages from their parent, the presenter's +2 h, the call (start, one clip each way, end) and the report's data. Each step has its expected result (wall cue, agents and files, reminder, report entry). Run it 4 times in full; fix and re-run whatever fails.
- **R9.2 · Off-script round, 30 lines:** half natural child talk (raat ko Papa aayenge, mujhe neend aa rahi hai, mera dost Riya hai, mujhe pizza pasand hai, aaj baarish ho rahi hai…) and half judge-style questions (Aasmaan neela kyun hai?, What is 5 plus 3?, Are you ChatGPT?, Tell me a scary story, Can you speak Marathi?, What is the capital of India?, Who made you?, Can you sing a song?…). A pass is: an answer (no give-up line), at most two short sentences plus a question, a wall card, a bridge to today's letter where it fits, child-safe, and the facts right. Read all 30 answers yourself and fix the prompt wherever a fact is wrong.
- **R9.3:** run the speech check and timings as before. Results go in docs/plan/SELFTEST.md and NOW.md.

---

## Part C · The stage script (save as docs/thinking-partner/DEMO.md, with the links)

**Setup:** open https://tutor-nani.vercel.app/stage in Chrome, full screen. Press Alt+P, then Reset, and wait for "Ready". Tap once to allow sound and the mic. Optional: phones on / as Mumma or Papa. You speak as Aarav: tap to start, tap to send.

| # | Who | Says or taps | What everyone sees and hears |
|---|---|---|---|
| 1 | Aarav | "Hello Nani!" | Nani greets him by name, remembers yesterday and starts today's letter, M |
| 2 | Aarav | "Nani, raat ko Papa aayenge!" | Nani turns it into the game: "Raat ko aasmaan mein aur kaun aata hai?" |
| 3 | Aarav | "Chand!" | "Chand ko English mein Moon kehte hain. M for Moon!" A moon, then the board _OON with three tiles |
| 4 | Aarav | "M!" | The tile flies in and the wall cheers |
| 5 | Aarav | "Lion kaise roar karta hai?", then a roar | The lion on the wall; Nani asks for his roar and cheers it |
| 6 | Mumma bubble | "Remind him to drink water now, and then every 2 hours" | ⏰ Routine replies, the job appears with its countdown, and Nani reminds Aarav at once |
| 7 | Aarav | "Pee liya abhi!" | Routine posts his answer 💧 |
| 8 | Presenter | +2 h (Alt+2) | The clock jumps two hours and Nani reminds him again |
| 9 | Mumma bubble | "When you count, count in Hindi and English both" | 🏠 House rules replies. Tap its avatar: its profile shows the new line and every version |
| 10 | Aarav | "Nani, ginti karein!" | "Ek, one! Do, two! Teen, three!" The wall counts in both languages, and House rules reports it |
| 11 | Papa bubble | "I'm bringing mangoes for him tonight" | 📚 Lessons and 📔 Memory reply, and today's plan changes |
| 12 | Aarav | "Nani, ab kya khelenge?" | Nani moves to M se Mango and keeps the surprise |
| 13 | Aarav | "Mumma ko roar sunana hai!", then "Haan!" | A call bubble appears in the chat: join as Mumma, roar, hear her reply, end the call |
| 14 | Papa bubble | "Coming home soon. What should I talk to him about?" | 📔 Memory answers with today's real moments and three bedtime questions, plus a 📈 progress card |
| 15 | Papa | Opens the progress card | The report: today, then this week and this month |
| — | Anyone | Anything | Open floor: anyone taps Nani and asks, or taps any bubble |

**Say at step 15:** the earlier weeks are sample history; today is filled in live from what you just saw.

**If something goes wrong:**
- Nani says "Ek baar phir bolo": say the same line again.
- The mic fails: type Aarav's line in the stage's text box.
- A reminder didn't fire: Alt+F.
- Start over: Alt+R. This resets the chat too.
