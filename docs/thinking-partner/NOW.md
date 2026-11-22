# Now · 2026-11-22 · Tutor Nani move done, brain on Claude

**The software now lives in the Tutor Nani project:**
- **GitHub:** Zugzwang-world/TutorNani
- **Vercel:** tutor-nani
- **Supabase:** "Tutor Nani"

The replica passed its side-by-side check against the old stack, and Nani's brain is now Claude Haiku 5.5, with Kimi as the backup for each call. On the same 4 lines, Claude's median time to the first audio is 2.45 s, against 3.18 s on Kimi. The stage script passed 15 of 15 on Claude, and no call fell back to Kimi. The old Tutor Grandma stack is still live and untouched, as a fallback. The toy and the laptop bridge haven't moved yet; they are the next brief.

## Links
- **Stage (the demo):** https://tutor-nani.vercel.app/stage. Open the presenter drawer with Alt+P (Option+P on a Mac), press Reset, and wait for "Ready".
- Parents' group chat: https://tutor-nani.vercel.app/
- Toy stand-in: https://tutor-nani.vercel.app/toy
- Projector wall: https://tutor-nani.vercel.app/home-base
- Presenter page: https://tutor-nani.vercel.app/presenter
- Tech pitch: https://tutor-nani.vercel.app/pitch.html
- Repo: https://github.com/Zugzwang-world/TutorNani
- The stage script: [DEMO.md](DEMO.md)
- Old stack (the fallback, untouched): https://tutor-grandma.vercel.app

## What is running
| Part | Now |
|---|---|
| Code | Zugzwang-world/TutorNani (public). main deploys to production through Vercel's Git integration |
| Web | Vercel project tutor-nani (team hrizzup): functions in bom1, Node 26. Production is public; previews need a Vercel login |
| Data | Supabase "Tutor Nani" (ref cglximouqzxbnjhkhmzp), in the same org and region (ap-south-1) as before. It holds a verified copy of the old data and all 61 audio files |
| Brain | Claude Haiku 5.5 (claude-haiku-5-5), thinking off and effort low, selected by BRAIN_PROVIDER=claude in Vercel. Kimi k2.6 takes any call where Claude errors, refuses, or sends no first token in time. Each turn records which brain answered (brainProvider, brainAttempt) |
| Voice | ElevenLabs, unchanged |

## Checks, 22 Nov (through the browser, no toy)
| Check | Kimi (the replica) | Claude (now) |
|---|---|---|
| Median time to first audio, same 4 lines | 3.18 s (old stack: 3.35 s) | 2.45 s |
| Stage script, steps 1 to 15 | 13 of 15. Step 1 said "beta" instead of his name, and Kimi stalled at step 12; the old stack shows both too | 15 of 15 |
| Calls that fell back to Kimi | not applicable | 0 of 20 turns |
| Voice, fillers, wall cues and cheer | pass | pass |
| Parents' chat, and the heartbeat fires once on the new stack only | pass | pass (script steps 6 to 14) |
| Progress report: day, week, month | pass | pass (step 15) |
| No request to the old stack | pass | pass |

## Next
1. Hardware brief: point the toy and the laptop bridge at https://tutor-nani.vercel.app. docs/toy-contract.md still names the old URL on purpose, until that brief.
2. Before any demo: run /preflight, then `python3 -I scripts/selftest/selftest.py script --runs 1`, then reset.
3. To roll the brain back: set BRAIN_PROVIDER=kimi in Vercel and redeploy.
4. Still open from the refinement run: replies that run over length, the stage chat header that truncates at 1440×900, listening to the wait music, and the seed dates (OPEN.md).
