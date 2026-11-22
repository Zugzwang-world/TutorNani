# Open

- Which Indian languages the demo uses.

## From the overnight beta (17 Nov), for the founder
- **Real devices:** please try a phone's mic on `/` (voice note) and `/toy`, an iPhone for ▶ and the toy's audio, and the projector's browser on `/home-base?demo=1`.
- **Nani's voice:** "Dulari Didi" from the ElevenLabs library is a stand-in for grandma's cloned voice. Is the clone coming before the demo?
- **"Nani" pronunciation:** speech-to-text heard ननी in three pre-made lines (`not_heard`, `offline`, `filler_wait_chashma`). Worth a listen.
- **Credits:** ElevenLabs about 17% of 100k characters used (resets 17 Nov 21:01 UTC); Kimi about 14.3 USD. Recheck before buildathon day.

## From the refinement run (19 Nov)
- 2026-11-19 · Usage stop set at 70% weekly · the run started at 64%, so REFINE's "15% weekly" cap was already passed; I used the "start + 6 points" rule instead.
- 2026-11-19 · On demo day (22 Nov) the seed's "last few days" in brain.md (14 to 16 Nov) and the progress history (ends 18 Nov) will be 4 to 6 days old, so "This week" will look thin and Nani's "yesterday" will be a week back. Shift the seed dates to the demo date before 22 Nov? (Not done tonight: it changes the seed story.)
- 2026-11-19 · The progress report's "today" brain call can run in parallel across Vercel instances if several phones open the report at once (cached 60 s per instance). Fine for one stage; watch it with many phones.
- 2026-11-19 · docs/toy-contract.md still describes press-and-hold for the paw; tap to talk maps the first tap to the press (ptt_start) and the second to the release (ptt_end). Update the wording for the hardware track (the message format is unchanged).
- 2026-11-19 · Please listen to `wait_music` (/audio/wait_music.mp3) and the new `slow_brain` line on a real speaker.

## From the Tutor Nani move (22 Nov)
- 2026-11-22 · The brain calls that don't stream (turn notes, memory answers, the evening brief, progress) have no Claude stall limit of their own. A stalled Claude call there uses the caller's whole timeout and then the old fallback; it never reaches Kimi. Spoken turns and the sorter are covered. Add a cap?
- 2026-11-22 · The old Tutor Grandma stack (repo, Vercel and Supabase) stays live as the fallback. When should it be retired?
- 2026-11-22 · The hardware brief must switch the toy and the laptop bridge to https://tutor-nani.vercel.app (docs/toy-contract.md:8 still names the old URL).
