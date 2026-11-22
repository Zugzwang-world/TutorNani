# PITCH.md · Tutor Grandma tech pitch page

**Size M · Who: one builder (Opus 5.5, xhigh) · Time box: 30 minutes from the moment you read this, hard stop.**

## What to make
One self-contained HTML page: a short pitch deck that explains the concept, the software and the hardware together. Most of the space goes to the hardware's tech. Keep it concise, visual and animated.
- **The core comes first:**
  - Nani's loop: hear, think, speak in grandma's voice, guided by the parents' agents.
  - The five core parts inside the toy.
- **Everything else is an add-on.** That includes where the talk button sits, glowing eyes, the projector, touch, motion and so on. Show add-ons around the core, graded Easy, Medium or Hard. Never present an add-on as required.

## Rules
- **30-minute hard stop.** If time runs short, simplify animations before dropping sections. Ship what works, merged and live.
- **One file.** No build step and no JS libraries: inline SVG, CSS and a little vanilla JS. Google Fonts are allowed (same as the Blueprint).
- **Leave the rest alone.** Don't touch app code, packages or Supabase. No self-tests.
- **Sources:**
  - Hardware: the attached Grandma Plush Blueprint. Save it as `docs/pitch/blueprint.html` for reference. Use its facts on parts, placement, wiring, power, sound, the projector and fallbacks.
  - Software: the repo, not the Blueprint. The Blueprint's software half is out of date (Fly.io relay, Scribe realtime, the text-to-dialogue WebSocket, Sonnet background agents, the knowledge map), so don't use it. Use "Facts to use" below.
- **Copy:** use the copy below as written; you may trim it. Headlines at most 8 words. Body at most 45 words per section.
- **Drawings:** no people (children or parents). Draw the toy, phone, wall and parts.
- **No dates or schedules** anywhere on the page.

## Output
1. `apps/web/public/pitch.html`, live at https://tutor-nani.vercel.app/pitch.html
2. A copy at `~/Downloads/Tutor-Grandma-Pitch.html`
3. This brief saved as `docs/pitch/PITCH.md`
4. One line in `docs/thinking-partner/NOW.md` with the link

Open a PR, squash-merge it, and check the live URL.

## Look and motion
- **Style:** continue the Blueprint's look, but as a deck.
  - Colours: marigold `#b0560e` and teal `#1d6b73` on warm paper, plus dark mode using the Blueprint's dark tokens.
  - Fonts: Bricolage Grotesque headings, IBM Plex Sans body, IBM Plex Mono labels.
  - Layout: full-viewport sections, big type, plenty of space, one idea per section.
- **Navigation:**
  - Scroll-snapping sections.
  - Arrow keys, PageUp, PageDown and Space step between sections.
  - A dot rail on the right, and the section number in a corner.
- **Motion:**
  - Animations that explain: flows, pulses, packets moving along lines, lines drawing in, cards lifting.
  - Each section's animation starts when it scrolls into view (IntersectionObserver). Explanatory animations loop gently.
  - Animate transforms and opacity only.
  - With `prefers-reduced-motion`: no motion, and everything shows in its final state.
- **Graphics:** polished inline SVG with consistent stroke widths. Marigold for the toy, teal for the cloud and data.
  - A cute, generic plush: round head, round ears, soft body. Not a known character.
  - The parts as simple, recognisable icons: a board with a chip and pins, a round MEMS mic, an amp board, a round speaker, a power bank, a pouch.
  - A phone with chat bubbles.
  - A projector house with an image on the wall.
- **Print:** each section prints on its own landscape page.
- **Widths:** works at 1440 px and at 390 px.

## Sections

### 1 · Title
- Eyebrow: **Tech overview · beta**
- Title: **Tutor Grandma**
- Sub: A soft toy that talks and teaches in grandma's voice. No screen for the child. Parents guide it by chatting with its agents.
- Visual:
  - The plush, centre-left, with soft rings pulsing from its tummy (its voice).
  - On the right, three small nodes (Toy, Wall, Parents' chat) linked by dashed lines, with dots travelling between them.
- Chips: ESP32-S3 · ElevenLabs · Supabase · Vercel

### 2 · How it fits together
- **Three pieces, one loop**
- The toy hears the child and answers in Nani's voice. The cloud thinks, guided by five agent files. The wall shows what Nani talks about. Parents shape it all from one group chat.
- Visual: a system map.
  - The parts: Toy (marigold) ⇄ Cloud (teal: Hear · Think · Speak, plus the five files) → Wall. Parents' chat ⇄ the five files.
  - A looping sequence:
    1. A voice packet goes from the toy to the cloud.
    2. Audio and a cue come back: the toy pulses and the wall shows 🥭.
    3. A chat bubble goes from the phone to the files.
    4. One file line glows.

### 3 · The core
- **The core: Nani's loop**
- Hear, think, speak: in grandma's voice, in the language of home, with English as the goal. Everything else on this page is optional.
- Visual: a loop of three stations around "Nani", with a dot circling and small sound waves at Speak.
  - Hear: speech to text
  - Think: the brain plus five files
  - Speak: grandma's voice
- Numbers row, from the beta: Reaction sound ≈ 0 s · First sentence 2.3 s (median) · Target ≈ 1 s (label it clearly as a target)

### 4 · Parents guide by chatting
- **Parents guide it like a group chat**
- Each of Nani's five files has its own agent. A parent says it once; the right agent updates its file; Nani follows on her next turn and reports back.
- Visual: a phone playing a looped chat, with a file card beside it.
  1. The chat shows "Remind him to drink water every 2 hours".
  2. "⏰ Routine is typing…"
  3. "Done! Every 2 hours from 10 to 6 💧"
  4. Beside the phone, `heartbeat.md` as a card: a new line types in and glows (`every 2 hours · say · Paani pi lo! Paani piya?`).
  5. The toy pulses "Paani piya?"
  6. The chat adds: He said "Pee liya abhi!" 💧
- Agent chips: 👵 Nani · persona.md · ⏰ Routine · heartbeat.md · 🏠 House rules · parent.md · 📚 Lessons · planner.md · 📔 Memory · brain.md

### 5 · Inside the toy
- **Inside the toy: five core parts**
- A Wi-Fi board, a microphone, an amplifier and speaker, and a power bank, in a zipped pouch inside almost any plush. About ₹3,500–4,000 per toy.
- Visual: a cutaway plush.
  - Core parts are solid, with labels that draw in one by one:
    - microphone near the face
    - speaker in the tummy
    - ESP32-S3 board and power bank in the back pouch
    - a talk trigger, labelled "a press anywhere: paw, ear or tummy"
  - Add-on spots are dashed ghosts tagged "add-on": eyes, touch spots, picture-card reader, motion sensor.
  - A small switch, "Core / Core + add-ons", fades the ghosts in.
- Part cards under it (icon, name, job, ≈ ₹):

| Part | Job | ≈ ₹ |
|---|---|---|
| ESP32-S3 DevKitC-1 N16R8 | Wi-Fi brain, 16 MB flash, 8 MB PSRAM | 839 |
| INMP441 I2S microphone | Hears at 16 kHz | 115–140 |
| MAX98357A amplifier | Drives the speaker | 194 |
| 40 mm, 4 Ω, 3 W speaker | Grandma's voice | 80–200 |
| USB power bank, 5,000–10,000 mAh | A day of play | 800–1,200 |

### 6 · Wiring
- **Two audio lanes, one board**
- Microphone in on one I2S bus, speaker out on another. The mic is off while Nani speaks, so the toy never hears itself and needs no echo cancellation.
- Visual: the Blueprint's wiring, simplified.
  - INMP441 → I2S0 (GPIO 5 · 4 · 6) → ESP32-S3 → I2S1 (GPIO 15 · 16 · 7) → MAX98357A → speaker.
  - Power bank 5 V → board and amp, with a capacitor across the amp.
  - Animate half-duplex: pulses run mic → board ("listening"), then board → speaker ("speaking"), never both at once.
  - Small note: "Pins proposed; checked against the firmware before flashing."

### 7 · Toy and cloud
- **One small contract between toy and cloud**
- The toy sends what the child said; Nani's sentences stream back one by one, each with its wall cue. No AI keys on the toy. The web toy already speaks this contract; real hardware speaks it directly or through a thin relay.
- Visual: an animated sequence diagram with three lanes (Toy · Cloud · Wall).
  - Steps appear in order:
    1. `audio`
    2. `heard`
    3. `say 0 · audio + cue`, and the wall shows 🥭
    4. `say 1`
    5. `done · timings`
  - A side lane shows `toy:aarav` events (reminder, call, clock) arriving at the toy.

### 8 · Software stack
- **Built on proven services**
- Each layer is swappable by config. The brain moves from Kimi to Claude Haiku with one value.
- Visual: layers sliding in, top to bottom.
  - Toy: ElatoAI firmware fork (open source, MIT), or the web toy
  - Edge: Next.js on Vercel, functions in Mumbai
  - Voice: ElevenLabs Scribe v3 (hearing) · Eleven v4 Turbo (live voice) · Eleven v4 (pre-made lines) · sound effects · music
  - Brain: Kimi k2.6 now → Claude Haiku 5.5
  - Memory and live sync: Supabase (Postgres, Realtime, Storage), Mumbai
  - Screens: parents' group chat · the wall · the web toy

### 9 · Add-ons
- **Build outward from the core**
- Each add-on gives Nani a new skill. Graded by how hard it is to add.
- Visual:
  - Three columns, Easy · Medium · Hard, each with a 1–3 dot difficulty meter.
  - The cards animate in column by column. Each card shows an icon, the name, what the child gets, and what it needs. Use the catalogue below.
  - Legend: Easy: an off-the-shelf part and a little firmware. Medium: a new part plus firmware and cloud changes. Hard: a new pipeline, research or safety design.

### 10 · Safe and never stuck
- **Safe, and never stuck**
  - Power bank with a protected cell, never a bare battery. Zip at the back; no loose small parts.
  - Keys stay in the cloud; the toy holds none.
  - If a toy fails: spare toy → ESP32-S3-BOX-3 → a phone in the plush → the web toy.
- Visual: a fallback ladder that lights up step by step.

### 11 · Close
- **Grandma's voice. Play-school learning. No screen.**
- Links:
  - Parents' chat: https://tutor-nani.vercel.app/
  - Web toy: https://tutor-nani.vercel.app/toy
  - Wall: https://tutor-nani.vercel.app/home-base
- Small: Beta

## Facts to use
- **Live:** https://tutor-nani.vercel.app (`/` parents' chat · `/toy` web toy · `/home-base` wall).
- **Beta measurements** (production self-test, 17 Nov):
  - The reaction sound plays ≈ 0 s after release.
  - Nani's first sentence: median 2.3 s.
  - Parents' chat, first agent reply: median 2.7 s.
  - 10 of 10 parent messages reached the right agents and files.
  - Speech check: 97%.
- **Target:** first word ≈ 1 s. Always label it as a target.
- **Stack:**
  - Voice: `scribe_v3`, `eleven_v4_turbo`, `eleven_v4`.
  - Edge and data: Vercel functions in bom1 (Mumbai); Supabase in ap-south-1 (Mumbai).
  - Brain: `kimi-k2.6` now, `claude-haiku-5-5` next.
- **Five agents and their files:**
  - Nani: persona.md
  - Routine: heartbeat.md
  - House rules: parent.md
  - Lessons: planner.md
  - Memory: brain.md
- **Toy contract:**
  - `POST /api/turn` returns an NDJSON stream: `heard`, `say` (audio + cues), `fallback`, `done`.
  - Channels: `toy:aarav` and `wall:aarav`.
  - Details are in `docs/toy-contract.md`.
- **Hardware, from the Blueprint:**
  - parts and prices: approximate November 2026 listings
  - pins: proposed
  - power draw: about 120–200 mA while streaming
  - power: a USB power bank
  - sound: half-duplex push-to-talk, 16 kHz mono capture
  - fallbacks: spare toy, ESP32-S3-BOX-3, a phone in the plush

## Add-on catalogue

| Grade | Add-on | The child gets | Needs |
|---|---|---|---|
| Easy | Talk button | Squeeze a paw (or an ear) to talk | Tactile switch in a rigid puck |
| Easy | Glowing eyes or heart | Sees Nani listening, thinking, speaking | 2 × WS2812B LEDs |
| Easy | Touch spots | Pat her head for a song | The ESP32-S3's built-in touch pins and conductive thread |
| Easy | Heartbeat buzz | A gentle buzz with praise or a reminder | Small vibration motor |
| Medium | Projector home base | The wall shows what Nani talks about | Android projector in a little house, kiosk browser on the wall page |
| Medium | Picture cards | Tap the mango card, and the mango game starts | NFC reader (RC522 or PN532) and cards |
| Medium | Motion sense | Pick her up to wake her; shake for a song | 6-axis motion sensor (MPU-6050) |
| Medium | Battery care | Parents hear "time to charge Nani" from Routine | Battery level reading and a heartbeat.md job |
| Hard | "Nani!" wake word | Talk without pressing anything | On-device wake-word model (Espressif ESP-SR) |
| Hard | Talk over each other | Interrupt Nani naturally | Echo cancellation and dual mics (ESP32-S3-BOX-3 class) |
| Hard | Moving parts | Nani nods or wiggles her ears as she talks | Micro-servos, plus power and noise design |
| Hard | Show and tell | Show a toy, and Nani names it in English | Camera on the ESP32-S3, a vision model, privacy design |

## Done when
- All 11 sections are there with their copy.
- Animations run. With reduced motion, final states show.
- Arrow keys step through the sections.
- A screenshot check at 1440 × 900 and 390 × 844, in light and dark, shows no overlapping text, no clipped SVG labels, and nothing off-screen.
- The page is live at `/pitch.html`, the copy is in Downloads, and the NOW.md line is added.

Report back in three lines: the link, what's in, anything you cut.
