# Now · 2026-11-19 · refinement run report

**The refinement run (docs/plan/REFINE.md) is live on production: R1 to R9 are merged, and the stage script runs on one screen at /stage. The script check (★1) passes on production (4 full runs, every step in at least 3 of 4). The latency check (★9) and, on the final prompt, the off-script check (★5) fall short; see below. Run window 01:28 to about 05:00 IST, usage 64% → 70% weekly. Production was reset to the seed at the end.** Details: docs/plan/RUNLOG.md (refinement run), docs/plan/SELFTEST.md.

## Links
- **Stage (the demo):** https://tutor-nani.vercel.app/stage · presenter drawer Alt+P (Option+P), Reset, wait for "Ready"
- Parents' group chat (phones): https://tutor-nani.vercel.app/
- Toy stand-in: https://tutor-nani.vercel.app/toy (`?type` adds a text box)
- Projector wall: https://tutor-nani.vercel.app/home-base (`?demo=1` cycles the cues)
- Presenter page: https://tutor-nani.vercel.app/presenter · Tech pitch: https://tutor-nani.vercel.app/pitch.html
- The stage script, step by step: [DEMO.md](DEMO.md) · Screenshots: docs/plan/shots/stage-1920x1080.png and stage-1440x900.png

## What changed
- **One screen (R1):** /stage puts Nani's world (the wall, her face, tap to talk, a caption, a typed-line box) on the left and the parents' world on the right. The right half holds the file strip, the jobs board, the chat and the idea bubbles. A hidden presenter drawer has Reset with a warm-up, +30 min, +2 h, Real time, Fire next job, Evening brief, Timings and the turns table.
- **Tap to talk (R1):** on /stage and /toy, one tap starts listening and the next sends. It sends by itself at 15 s, and a tap while Nani speaks stops her. The toy contract's messages are unchanged.
- **Idea bubbles (R2):** 14 illustrated bubbles float beside the chat on wide screens; phones keep the chip row. Each bubble posts as its own parent.
- **Agent profiles (R5):** tap an agent's avatar or name, or a file chip on the stage, for a full-screen profile: who I am, how I work, examples, my file now, versions with diffs. Profiles update live.
- **The game inside anything (R6):** Nani bridges what Aarav says to today's letter ("Raat ko Papa aayenge" → "Raat ko aasmaan mein aur kaun aata hai?" → "Chand!" → Moon card and the MOON board). She answers any question with one true fact. New show cards carry the Hindi and extra emojis, and counts show Hindi and English. Today's bridge words go to speech-to-text as keyterms ("Chand" is now heard right).
- **Progress report (R7):** Today, This week, This month and All time, as a word garden, a letter garland, counting diyas, a calendar, a mood strip, tricky spots, routine rows and highlights. It opens from a 📈 card under Memory's answers, the 📈 header button or the stage's 📈 chip. The earlier weeks are 36 days of sample history; today fills in live.
- **Waiting (R3):** the spoken fillers are gone, and only calm reactions remain at the send tap. A soft marimba loop (`wait_music`) plays only when Nani has no first sentence 2.5 s after the tap, and fades within 300 ms of her first sentence. The 8 s give-up now asks him to say it again.
- **Reminders on the real clock (R4):** "now, and then every 2 hours" fires within about 2 s of Routine's reply, and +2 h fires exactly one more. One-off jobs are written to the second with a date, and reminders wait until Nani is idle.
- **Clean-up (R8):** shells and money are gone; "count in Hindi and English both" is the House rules example. Reset warms up the brain, the voice and the database, then shows "Ready". Preflight treats a 404 on agent_files as broken.

## Self-test on production (R9, docs/plan/SELFTEST.md)
| ★ | Check | Result |
|---|---|---|
| 1 | Script, steps 1–15, 4 full runs, each step ≥ 3/4 | ✅ Final prompt: 13 steps 4/4; steps 1 and 5 3/4. |
| 2 | Bridge: chand, then Moon and the board | ✅ Steps 2 and 3: 4/4 in every round. |
| 3 | Reminders: now within ~2 s, +2 h exactly one more | ✅ Steps 6 and 8: 4/4. R4 measured 1.31 s from Routine's reply to the reminder. |
| 4 | Every bubble reaches exactly the agents it shows | ✅ 14/14 after the fixes. The first pass was 11/14: talk-about pulled in Nani, rainbow pulled in Memory, and the cars label now shows Memory. |
| 5 | Off-script round ≥ 27/30 | ⚠️ 27/30 on one round, 24/30 on the final prompt; it varies with Kimi. On my read, the final answers have no wrong facts and nothing unsafe. The misses are 3 sentences instead of 2, a missing wall card, and one Kimi stall. |
| 6 | Stage at 1920×1080 and 1440×900 | ✅ No overlap, no page errors. At 1440 the chat header's title truncates ("A…"). |
| 7 | Report: four views; today shows the run's words | ✅ Step 15: 4/4. |
| 8 | Tap to talk on /stage and /toy | ✅ The reviewer checked it live: 15.0 s auto-send and barge-in work. Two reviewer fixes are in: waking on a bare Alt or Cmd press, and the double tap. |
| 9 | Waiting: no filler, music only when late, first sentence ≤ 2.3 s | ⚠️ No filler plays, and the music fades in 256–279 ms. The median first sentence over voice turns was 2.44–2.73 s across rounds (last self-test 2.3 s), so the music would play on 50–77% of voice turns. Typed turns: 1.82 s. |

## Known issues and next steps
1. **Latency (★9):** speech-to-text takes about 0.8 s and Kimi's first sentence about 1.5–2 s, and Kimi was slower tonight. Kimi still stalls on about 1 turn in 5 to 7, which the retry, the music and "Ek baar phir bolo" cover. The real fix is the brain switch, but test the Claude path first (OPEN.md).
2. **Off-script (★5)** varies between 24 and 27 of 30 with Kimi. The misses are length overruns and an occasional missing wall card, not facts.
3. The stage's chat header title truncates at 1440×900.
4. The wait music has never been listened to by a person; its join measures clean.
5. The idle hold on reminders is only unit-tested.
6. On demo day (22 Nov) the seed's "last few days" (14–16 Nov) will be 6 days old (OPEN.md).
