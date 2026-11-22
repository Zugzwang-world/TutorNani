# Open

- Anthropic credit: the last call (2026-11-16) still said "credit balance is too low". That's fine while Kimi runs the brain, but fix it before the switch to Claude on 22 November.
- Which Indian languages the demo uses.

## From the overnight beta (17 Nov), for the founder
- **Kimi stalls:** k2.6 stalls on 10–15% of turns (7–10 s). Retries and fillers soften it, but on stage about 1 turn in 7 can end with "Chalo, ek naya khel". Fix Anthropic credit and switch to Claude Haiku 5.5 early? It is one value in content/demo.config.json, but the Anthropic path is written and untested end to end (the key still said "credit balance is too low" at 05:15 IST); test it once the credit is fixed.
- **Real devices:** please try a phone's mic on `/` (voice note) and `/toy`, an iPhone for ▶ and the toy's audio, and the projector's browser on `/home-base?demo=1`.
- **Nani's voice:** "Dulari Didi" from the ElevenLabs library is a stand-in for grandma's cloned voice. Is the clone coming before the demo?
- **"Nani" pronunciation:** speech-to-text heard ननी in three pre-made lines (`not_heard`, `offline`, `filler_wait_chashma`). Worth a listen.
- **Credits:** ElevenLabs about 17% of 100k characters used (resets 17 Nov 21:01 UTC); Kimi about 14.3 USD. Recheck before buildathon day.

## From the refinement run (19 Nov)
- 2026-11-19 · Usage stop set at 70% weekly · the run started at 64%, so REFINE's "15% weekly" cap was already passed; I used the "start + 6 points" rule instead.
- 2026-11-19 · On demo day (22 Nov) the seed's "last few days" in brain.md (14 to 16 Nov) and the progress history (ends 18 Nov) will be 4 to 6 days old, so "This week" will look thin and Nani's "yesterday" will be a week back. Shift the seed dates to the demo date before 22 Nov? (Not done tonight: it changes the seed story.)
- 2026-11-19 · The progress report's "today" brain call can run in parallel across Vercel instances if several phones open the report at once (cached 60 s per instance). Fine for one stage; watch it with many phones.
- 2026-11-19 · docs/toy-contract.md still describes press-and-hold for the paw; tap to talk maps the first tap to the press (ptt_start) and the second to the release (ptt_end). Update the wording for the hardware track (the message format is unchanged).
- 2026-11-19 · For later: the Claude path in lib/brain.ts sends neither `thinking: {type: "disabled"}` nor `output_config: {effort: "low"}`, so Haiku 5.5 would run with thinking on. Fix it and measure before any switch (R8.4).
- 2026-11-19 · Latency: the median time to Nani's first sentence on voice turns was 2.4–2.7 s tonight, against 2.3 s last time, so the wait music plays on most turns. It is mostly Kimi. Is that acceptable for the demo, or should the Claude path be fixed and tested before 22 Nov?
- 2026-11-19 · Please listen to `wait_music` (/audio/wait_music.mp3) and the new `slow_brain` line on a real speaker.
