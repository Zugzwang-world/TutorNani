# DEMO · the stage script

One screen does the whole demo: **https://tutor-nani.vercel.app/stage** (Chrome, full screen, 16:9). Left half: Nani's world (the wall, her face, the talk button, a caption, a text box). Right half: the parents' world (the file strip and jobs board on top, the group chat in the middle, idea bubbles on both sides).

**Links**
- Stage: https://tutor-nani.vercel.app/stage (presenter drawer: Alt+P, or Option+P on a Mac, or the small handle in a corner)
- Parents' chat on phones: https://tutor-nani.vercel.app/ (pick Mumma or Papa)
- Toy stand-in: https://tutor-nani.vercel.app/toy (`?type` adds a text box)
- Projector wall: https://tutor-nani.vercel.app/home-base (`?demo=1` cycles the cues)
- Presenter page: https://tutor-nani.vercel.app/presenter
- Tech pitch: https://tutor-nani.vercel.app/pitch.html
- Reset from a terminal: `curl -X POST https://tutor-nani.vercel.app/api/reset`

**Shortcuts on the stage** (only when no text box has focus): Alt+P drawer · Alt+2 +2 h · Alt+F fire next job · Alt+R reset · Space starts and sends like a tap.

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

**How it behaves**
- Tap to talk: one tap starts listening ("Listening… tap to send"), the next tap sends. It sends by itself after 15 s. A tap while Nani speaks stops her.
- If Nani is slow (no first sentence after 2.5 s), soft music plays under the thinking scene and fades the moment she speaks. After 8 s she asks him to say it again.
- Reminders run on the real clock: "now" fires within about 2 s of Routine's reply, and the jobs board counts down to the next one.
- Tap any file chip (or an agent's name in the chat) for that agent's profile; tap 📈 for Aarav's progress report.
