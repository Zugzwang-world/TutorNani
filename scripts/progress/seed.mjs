#!/usr/bin/env node
// Writes content/progress-seed.json: 8 weeks of sample history for the progress report (REFINE R7.2).
// Deterministic (a seeded generator, no clock, no brain calls). Agrees with brain.md in content/seed.json:
// letters A to L before today (L on 14 Nov, K on 15 Nov), counts to 5, lion/cow/cat/dog and red/blue/yellow known,
// 14 Nov the roar for Mumma, 15 Nov the ladoo for Riya, 16 Nov colours and "Thank you, Nani!", 17 and 18 Nov quiet.
//
// Per-day semantics (the report aggregates them):
//   words      words he met that day (firstSaid = that day); the earliest day wins
//   letters    learnt = letters he made his own that day; working = letters he practised that day
//   counting   upTo = how far he counted that day (the report carries the highest forward)
//   areas      moments in each planner area that day (drives the radial chart; never shown as a number)
//
// Run: node scripts/progress/seed.mjs            (writes the JSON)
//      node scripts/progress/seed.mjs --upsert   (also upserts the rows into progress_days; needs apps/web/.env.local)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "content", "progress-seed.json");
const CHILD = "aarav";

// ---------- seeded generator (mulberry32) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261119);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// ---------- words ----------
// [en, hi (Roman letters), emoji, area]
const W = {
  apple: ["Apple", "seb", "🍎", "language"],
  ant: ["Ant", "cheenti", "🐜", "language"],
  aeroplane: ["Aeroplane", "hawai jahaz", "✈️", "language"],
  ball: ["Ball", "gend", "⚽", "language"],
  banana: ["Banana", "kela", "🍌", "language"],
  butterfly: ["Butterfly", "titli", "🦋", "language"],
  blue: ["Blue", "neela", "🔵", "numbers"],
  cat: ["Cat", "billi", "🐱", "language"],
  car: ["Car", "gaadi", "🚗", "language"],
  cow: ["Cow", "gaay", "🐄", "language"],
  circle: ["Circle", "gol", "⭕", "numbers"],
  dog: ["Dog", "kutta", "🐶", "language"],
  duck: ["Duck", "batakh", "🦆", "language"],
  drum: ["Drum", "dhol", "🥁", "culture"],
  elephant: ["Elephant", "haathi", "🐘", "language"],
  egg: ["Egg", "anda", "🥚", "language"],
  five: ["Five", "paanch", "🖐️", "numbers"],
  fish: ["Fish", "machhli", "🐟", "language"],
  flower: ["Flower", "phool", "🌸", "language"],
  frog: ["Frog", "medhak", "🐸", "language"],
  goat: ["Goat", "bakri", "🐐", "language"],
  grapes: ["Grapes", "angoor", "🍇", "language"],
  green: ["Green", "hara", "🟢", "numbers"],
  happy: ["Happy", "khush", "😊", "feelings"],
  hat: ["Hat", "topi", "👒", "language"],
  hen: ["Hen", "murgi", "🐔", "language"],
  house: ["House", "ghar", "🏠", "language"],
  icecream: ["Ice cream", "ice cream", "🍦", "language"],
  big: ["Big", "bada", "🐘", "numbers"],
  small: ["Small", "chhota", "🐭", "numbers"],
  juice: ["Juice", "ras", "🧃", "language"],
  jeep: ["Jeep", "jeep", "🚙", "language"],
  please: ["Please", "kripya", "🙏", "feelings"],
  lamp: ["Lamp", "diya", "🪔", "culture"],
  rangoli: ["Rangoli", "rangoli", "🌼", "culture"],
  sweet: ["Sweet", "mithai", "🍬", "culture"],
  triangle: ["Triangle", "tikona", "🔺", "numbers"],
  kite: ["Kite", "patang", "🪁", "language"],
  key: ["Key", "chaabi", "🔑", "language"],
  kangaroo: ["Kangaroo", "kangaroo", "🦘", "language"],
  lion: ["Lion", "sher", "🦁", "language"],
  leaf: ["Leaf", "patta", "🍃", "language"],
  share: ["Share", "baantna", "🤝", "feelings"],
  red: ["Red", "laal", "🔴", "numbers"],
  yellow: ["Yellow", "peela", "🟡", "numbers"],
  thankyou: ["Thank you", "shukriya", "🙏", "feelings"],
  sad: ["Sad", "udaas", "😢", "feelings"],
  star: ["Star", "taara", "⭐", "culture"],
};

// ---------- the days (hand-written moments; quiet days are simply absent) ----------
// t: first play time; w: [[key, his words?]]; learnt / working: letters; count: how far he counted;
// moods: [time, feeling, what, helped?]; hi: [text, quote?]; tricky: [what, tip]; r: [waterAsked, waterDone, calls, stories];
// song: sang that day; lines / starters: hand-written (otherwise built from the day).
const DAYS = [
  { day: "2026-09-24", t: "17:10", working: ["A"], count: 3,
    w: [["apple", "Seb! Apple!"], ["ant"]],
    moods: [["17:12", "excited", "Met Nani for the first time and told her his name"]],
    hi: [["First hello: told Nani his name and that he loves lions", "Main Aarav hoon! Mujhe sher pasand hai!"]],
    r: [2, 1, 1, 0],
    lines: ["First day with Nani: he told her his name and that he loves lions.", "Met A for Apple 🍎 and Ant 🐜.", "Counted three apples with her."],
    starters: ["What did you tell Nani about lions?", "What does A stand for?", "How many apples did you count?"] },
  { day: "2026-09-25", t: "18:05", working: ["A"], count: 3,
    w: [["aeroplane", "Hawai jahaz! Zoom!"], ["cat", "Billi meow karti hai"]],
    moods: [["18:20", "happy", "Flew a pretend aeroplane round the room"]], r: [2, 2, 0, 0] },
  { day: "2026-09-26", t: "10:40", learnt: ["A"], count: 3,
    w: [["cow", "Gaay moo karti hai!"], ["dog", "Bhow bhow!"]],
    moods: [["10:45", "happy", "Mooed like a cow and barked like a dog"]],
    hi: [["A is his: said A for Apple, Ant and Aeroplane in one go", "A for Apple, Ant, Aeroplane!"]], r: [3, 2, 1, 1], song: true },
  { day: "2026-09-28", t: "17:30", working: ["B"], count: 3,
    w: [["ball", "Gend! Ball!"], ["banana", "Kela!"]], r: [2, 1, 0, 0] },
  { day: "2026-09-29", t: "17:45", working: ["B"], count: 4,
    w: [["butterfly", "Titli udd gayi"], ["blue", "Aasmaan neela hai"]],
    moods: [["17:50", "calm", "Talked about the blue sky and butterflies"]], r: [2, 2, 0, 1] },
  { day: "2026-10-01", t: "17:20", learnt: ["B"], count: 4,
    w: [["car", "Gaadi vroom vroom!"]],
    moods: [["17:25", "excited", "Found out Car is a C word and wanted more car words"]], r: [3, 2, 1, 0],
    tricky: ["B and D sound alike to him (ball, doll)", "Hold your lips shut and pop them open: b-b-ball. Ask him to copy you."] },
  { day: "2026-10-02", t: "11:00", working: ["C"], count: 4,
    w: [["circle", "Gol gol roti!"]],
    hi: [["Holiday morning: found circles all over the kitchen", "Roti gol hai! Plate bhi gol!"]], r: [3, 3, 1, 0], song: true },
  { day: "2026-10-03", t: "10:15", working: ["C"], count: 4,
    w: [["duck", "Batakh quack quack"]], r: [2, 1, 0, 1] },
  { day: "2026-10-05", t: "17:40", learnt: ["C"], count: 4,
    w: [["drum", "Dhol bajao!"]],
    moods: [["17:45", "excited", "Drummed on the table for the dhol song"]], r: [2, 2, 0, 0] },
  { day: "2026-10-07", t: "18:00", working: ["D"], count: 4,
    w: [["elephant", "Haathi bahut bada hai"], ["big"], ["small"]], r: [3, 2, 1, 0] },
  { day: "2026-10-08", t: "17:35", learnt: ["D"], count: 4,
    w: [["egg", "Anda gol hai"]],
    hi: [["Barked for D for Dog and made Nani laugh", "D for Dog! Bhow bhow!"]], r: [2, 1, 0, 1] },
  { day: "2026-10-10", t: "10:30", working: ["E"], count: 4,
    w: [["fish", "Machhli paani mein"]], r: [2, 2, 0, 0], song: true },
  { day: "2026-10-11", t: "11:10", working: ["E"], count: 4,
    w: [["happy", "Main khush hoon!"]], r: [2, 1, 1, 0] },
  { day: "2026-10-12", t: "17:50", learnt: ["E"], count: 4,
    w: [["sad", "Main udaas hoon"]],
    moods: [["17:55", "sad", "Riya couldn't come over to play", "Nani asked what he'd like to draw for Riya. He drew her a red flower."]],
    r: [2, 2, 0, 1],
    lines: ["A sad start: Riya couldn't come to play.", "Drew a red flower for her, and felt better.", "E for Egg and Elephant is his now."] },
  { day: "2026-10-14", t: "17:25", working: ["F"], count: 4,
    w: [["flower", "Phool Riya ke liye"], ["frog", "Medhak jump!"]], r: [3, 2, 0, 0],
    tricky: ["E and F look alike to him", "Draw both in the air together: E has one more line at the bottom."] },
  { day: "2026-10-16", t: "18:10", learnt: ["F"], count: 4,
    w: [["five", "Paanch! Five!"]],
    moods: [["18:15", "excited", "Showed five fingers and shouted 'Five!'"]], r: [2, 2, 1, 0] },
  { day: "2026-10-17", t: "10:50", working: ["G"], count: 4,
    w: [["goat", "Bakri mehh"]], r: [2, 1, 0, 1], song: true },
  { day: "2026-10-19", t: "17:30", working: ["G"], count: 5,
    w: [["grapes", "Angoor khatte hain!"], ["green", "Hara angoor"]], r: [2, 2, 0, 0],
    hi: [["Counted five grapes all on his own", "Ek, do, teen, char, paanch! Five!"]] },
  { day: "2026-10-20", t: "11:20", learnt: ["G"], count: 5,
    w: [["star", "Taara chamak raha hai"]],
    moods: [["11:30", "calm", "Sang 'Twinkle twinkle' slowly with Nani"]], r: [3, 2, 1, 0], song: true },
  { day: "2026-10-22", t: "17:40", working: ["H"], count: 5,
    w: [["hat", "Topi! Hat!"], ["hen", "Murgi"]], r: [2, 1, 0, 0],
    tricky: ["H goes quiet for him: says 'at' for Hat", "Hold his palm near your mouth and say 'h-h-hat': let him feel the H."] },
  { day: "2026-10-24", t: "10:35", learnt: ["H"], count: 5,
    w: [["house", "Mera ghar!"]], r: [2, 2, 0, 1] },
  { day: "2026-10-25", t: "11:00", working: ["I"], count: 5,
    w: [["icecream", "Ice cream thanda hai!"]],
    moods: [["11:05", "excited", "Pretended to eat a huge ice cream"]], r: [2, 2, 1, 0], song: true },
  { day: "2026-10-27", t: "17:30", learnt: ["I"], count: 5,
    w: [["please", "Please, Nani, ek aur!"]],
    hi: [["Said 'please' to ask for one more game", "Please, Nani, ek aur!"]], r: [3, 2, 0, 0] },
  { day: "2026-10-29", t: "17:55", working: ["J"], count: 5,
    w: [["juice", "Mango juice!"], ["triangle", "Tikona, jaise samosa"]], r: [2, 1, 0, 1] },
  { day: "2026-10-31", t: "10:20", working: ["J"], count: 5,
    w: [["jeep", "Jeep jungle mein!"]], r: [2, 2, 0, 0] },
  { day: "2026-11-01", t: "11:15", learnt: ["J"], count: 5,
    w: [["lamp", "Diya jalao!"]],
    hi: [["Got ready for Diwali: counted diyas for the window", "Ek diya, do diya, teen diya!"]], r: [2, 2, 1, 0], song: true },
  { day: "2026-11-02", t: "17:45", count: 5,
    w: [["rangoli", "Rangoli mein laal aur peela"]], r: [2, 1, 0, 1] },
  { day: "2026-11-05", t: "18:30", count: 3,
    w: [],
    moods: [["18:35", "tired", "Had a cold and didn't want to play letters", "Nani hummed 'Machli jal ki rani hai' softly, and he hummed along."]],
    r: [3, 3, 0, 1],
    lines: ["A quiet, sniffly evening: he had a cold.", "No letters today, just a soft song with Nani.", "He hummed 'Machli jal ki rani hai' along with her."],
    starters: ["Can you hum the fish song for me?", "Is your nose feeling better today?", "What song should Nani sing when you're tired?"] },
  { day: "2026-11-06", t: "17:20", count: 4,
    w: [["sweet", "Mithai! Ladoo!"]], r: [2, 2, 0, 0] },
  { day: "2026-11-07", t: "19:10", count: 4,
    w: [],
    moods: [["19:15", "scared", "Loud crackers outside made him jump", "Nani counted the diyas with him in a soft voice, then he went to sit with Mumma."]],
    r: [2, 1, 1, 0] },
  { day: "2026-11-08", t: "10:30", count: 5,
    w: [["share", "Sabko mithai do!"]],
    moods: [["10:35", "excited", "Wished Nani 'Happy Diwali!' first thing in the morning"]],
    hi: [["Happy Diwali! Counted five diyas and wanted to share sweets with everyone", "Happy Diwali, Nani!"]],
    r: [1, 1, 1, 0], song: true,
    lines: ["Diwali morning: he wished Nani first thing.", "Counted five diyas 🪔 all by himself.", "Wanted everyone to get a sweet."],
    starters: ["How many diyas did we light?", "Who did you share your sweets with?", "What colours were in our rangoli?"] },
  { day: "2026-11-11", t: "17:35", working: ["K"], count: 5,
    w: [["kite", "Patang upar!"]], r: [2, 2, 0, 0],
    tricky: ["Taking turns: wants to go first every time", "Play one quick game tonight where you go first, and cheer when he waits."] },
  { day: "2026-11-12", t: "18:00", working: ["K"], count: 5,
    w: [["key", "Chaabi! Key!"]], r: [3, 2, 0, 1],
    tricky: ["Counting past 5: six and seven get swapped", "Count the stairs together tonight, slowly, one step for each number up to seven."] },
  { day: "2026-11-14", t: "17:15", learnt: ["L"], count: 5,
    w: [["lion", "Sher! ROAAAR!"], ["leaf", "Patta hara hai"]],
    moods: [["17:20", "excited", "Roared like a lion for L for Lion", undefined]],
    hi: [["Children's Day: roared very loudly for L for Lion and sent Mumma his roar", "ROAAAR! Mumma, suno!"]],
    r: [2, 2, 1, 0],
    lines: ["L for Lion 🦁: L is his now.", "Roared very loudly and sent Mumma his roar.", "Said 'patta' is Leaf, and it's green."],
    starters: ["Can you roar like you did for Mumma?", "What starts with L?", "What colour is a leaf?"] },
  { day: "2026-11-15", t: "10:45", learnt: ["K"], count: 5,
    w: [["kangaroo", "Kangaroo jump jump!"]],
    moods: [["10:50", "happy", "Jumped like a kangaroo around the room"], ["11:05", "happy", "Shared a pretend ladoo with Riya"]],
    hi: [["Shared a pretend ladoo with Riya", "Riya, ek ladoo tumhare liye!"]],
    r: [2, 2, 0, 1], song: true,
    lines: ["K for Kangaroo 🦘: K is his now.", "Learned kangaroos live in Australia and jump.", "Shared a pretend ladoo with Riya."],
    starters: ["How does a kangaroo move?", "Where do kangaroos live?", "What did you share with Riya?"] },
  { day: "2026-11-16", t: "17:40", count: 5,
    w: [["red", "Seb laal hai!"], ["yellow", "Kela peela hai!"], ["thankyou", "Thank you, Nani!"]],
    moods: [["17:45", "happy", "Said 'Thank you, Nani!' all by himself"]],
    hi: [["Said 'Thank you, Nani!' all by himself", "Thank you, Nani!"]],
    r: [3, 2, 1, 0],
    lines: ["Colours day: red apple 🍎, yellow banana 🍌.", "Said \"Thank you, Nani!\" all by himself.", "Nani cheered him, just as Papa asked."],
    starters: ["What colour is a banana?", "What colour is an apple?", "Who did you say thank you to today?"] },
];

// ---------- build ----------
const AREAS = ["language", "numbers", "feelings", "culture"];
const iso = (day, hhmm) => `${day}T${hhmm}:00+05:30`;
const addMin = (hhmm, m) => {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = h * 60 + mm + m;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const forWord = (letter, words) => words.find((w) => w.en.toUpperCase().startsWith(letter));
const met = []; // every word met so far, oldest first (for "A for Apple")

function build(d) {
  const words = d.w.map(([k, quote], i) => {
    const [en, hi, emoji, area] = W[k];
    return { en, hi, emoji, area, ...(quote ? { quote } : {}), firstSaid: iso(d.day, addMin(d.t, 3 + i * between(4, 9))) };
  });
  const learnt = d.learnt ?? [];
  const working = d.working ?? [];
  const areas = Object.fromEntries(AREAS.map((a) => [a, 0]));
  for (const w of words) areas[w.area] += 1;
  areas.language += learnt.length * 2 + working.length + between(0, 2);
  areas.numbers += 1 + between(0, 1);
  areas.feelings += (d.moods ?? []).length + (d.hi ? 1 : 0);
  areas.culture += (d.song ? 1 : 0) + between(0, 1);
  const moods = (d.moods ?? []).map(([time, feeling, what, helped]) => ({ time, feeling, what, ...(helped ? { helped } : {}) }));
  const [asked, done, calls, stories] = d.r;
  const highlights = (d.hi ?? []).map(([text, quote]) => ({ text, ...(quote ? { quote } : {}) }));
  const tricky = d.tricky ? [{ what: d.tricky[0], tip: d.tricky[1] }] : [];

  met.push(...words);
  const letterWord = (l) => (forWord(l, words) ?? forWord(l, met))?.en;
  const summary =
    d.lines ??
    [
      words.length
        ? pick([`New words: ${list(words.map((w) => `${w.en} ${w.emoji}`))}.`, `Said ${list(words.map((w) => w.en))} in English.`])
        : "A short play with Nani.",
      learnt.length
        ? `${learnt[0]} is his now${letterWord(learnt[0]) ? `: ${learnt[0]} for ${letterWord(learnt[0])}` : ""}.`
        : working.length
          ? `Practised ${working[0]}${letterWord(working[0]) ? ` for ${letterWord(working[0])}` : ""} on the wall.`
          : `Counted to ${d.count} with Nani.`,
      highlights[0]?.text
        ? `${highlights[0].text}.`
        : moods[0]
          ? `${moods[0].what}.`
          : d.song
            ? "Sang the counting song together 🎵"
            : learnt.length || working.length
              ? `Counted to ${d.count} with Nani.`
              : done
                ? "Drank his water when Nani reminded him 💧"
                : "Asked Nani for one more game.",
    ];
  const starters =
    d.starters ??
    [
      words[0] ? `How do you say ${words[0].hi} in English?` : "What did you play with Nani?",
      learnt[0] || working[0] ? `Can you find something at home that starts with ${learnt[0] ?? working[0]}?` : `Can you count to ${d.count} for me?`,
      moods[0] ? pick(["What made you smile with Nani today?", "What was the best bit of today?"]) : pick(["Which word was your favourite?", "Will you teach me a new word?"]),
    ];
  return {
    day: d.day,
    data: {
      words,
      letters: { learnt, working },
      counting: { upTo: d.count },
      areas,
      moods,
      tricky,
      routine: { water: { asked, done }, calls, stories },
      highlights,
      starters,
      summary,
    },
  };
}

const seed = { childId: CHILD, days: DAYS.map(build) };

// ---------- checks against brain.md ----------
const learntAll = seed.days.flatMap((d) => d.data.letters.learnt);
const want = "ABCDEFGHIJKL".split("");
if (learntAll.slice().sort().join("") !== want.join("")) throw new Error(`letters learnt ${learntAll.join("")} != A to L`);
if (seed.days.find((d) => d.day === "2026-11-14").data.letters.learnt[0] !== "L") throw new Error("14 Nov must be L");
if (seed.days.find((d) => d.day === "2026-11-15").data.letters.learnt[0] !== "K") throw new Error("15 Nov must be K");
if (seed.days.some((d) => d.day >= "2026-11-17")) throw new Error("17 and 18 Nov are quiet");
if (Math.max(...seed.days.map((d) => d.data.counting.upTo)) > 5) throw new Error("brain.md: counts to 5");
for (const k of ["Lion", "Cow", "Cat", "Dog", "Red", "Blue", "Yellow"]) {
  if (!seed.days.some((d) => d.data.words.some((w) => w.en === k))) throw new Error(`missing word ${k}`);
}
const upset = seed.days.flatMap((d) => d.data.moods).filter((m) => ["upset", "scared", "sad", "tired"].includes(m.feeling));
if (upset.length < 2 || upset.length > 3 || upset.some((m) => !m.helped)) throw new Error("two or three upset moments, each with what helped");

writeFileSync(OUT, `${JSON.stringify(seed, null, 2)}\n`);
console.log(`wrote ${OUT}: ${seed.days.length} days, ${seed.days.reduce((n, d) => n + d.data.words.length, 0)} words`);

// ---------- optional: upsert into progress_days ----------
if (process.argv.includes("--upsert")) {
  const env = Object.fromEntries(
    readFileSync(join(ROOT, "apps", "web", ".env.local"), "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
  );
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/progress_days?on_conflict=child_id,day`;
  const rows = seed.days.map((d) => ({ child_id: CHILD, day: d.day, data: d.data, updated_at: new Date().toISOString() }));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsert ${res.status}: ${await res.text()}`);
  console.log(`upserted ${rows.length} rows into progress_days`);
}
