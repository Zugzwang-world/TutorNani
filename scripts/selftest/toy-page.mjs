// One headless /toy page for the self-test's script mode (R9.1).
// Reminders fire in the browser (app/toy/use-routine.ts), so script mode keeps this page open for a whole run.
//
//   node toy-page.mjs <playwright-dir> <url> [logfile]
//
// <playwright-dir> holds node_modules/playwright (installed by selftest.py into scripts/selftest/.cache/pw).
// Chrome flags: fake mic and camera (no permission prompt), autoplay without a gesture.
// The page is woken with one tap ("Tap to wake Nani"). Awake state is not kept across a reload (and the server's
// `reset` broadcast reloads the page), so a watcher taps the overlay again whenever it shows up.
//
// stdin commands (one per line):   status | reload | quit
// stdout JSON lines:               {"ev":"ready"} {"ev":"awake","n":1} {"ev":"status","awake":true,"loads":2,...} {"ev":"bye"}
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [pwDir, url, logFile] = process.argv.slice(2);
if (!pwDir || !url) {
  console.error("usage: node toy-page.mjs <playwright-dir> <url> [logfile]");
  process.exit(2);
}
const require = createRequire(path.join(pwDir, "package.json"));
const { chromium } = await import(pathToFileURL(require.resolve("playwright")).href).then((m) => m.default ?? m);

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const log = (s) => {
  if (logFile) appendFileSync(logFile, `${new Date().toISOString()} ${s}\n`);
};

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 420, height: 800 }, permissions: ["microphone"] });
const page = await context.newPage();
page.on("console", (m) => log(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => log(`[pageerror] ${e.message}`));
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) {
    loads++;
    log(`[nav] ${f.url()}`);
  }
});

let loads = 0;
let wakes = 0;
let closing = false;

async function overlayShowing() {
  return page
    .getByText("Tap to wake Nani")
    .first()
    .isVisible()
    .catch(() => false);
}

async function wakeOnce() {
  if (!(await overlayShowing())) return false;
  await page.getByText("Tap to wake Nani").first().click({ timeout: 3000 }).catch(() => {});
  wakes++;
  out({ ev: "awake", n: wakes });
  return true;
}

async function status() {
  const showing = await overlayShowing();
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return {
    ev: "status",
    awake: !showing && text.length > 0,
    micPending: /Allow the microphone/i.test(text),
    loads,
    wakes,
    url: page.url(),
    text: text.replace(/\s+/g, " ").slice(0, 160),
  };
}

// The watcher: every 700 ms, tap the wake overlay if it is showing (first load, reload, server reset).
(async () => {
  while (!closing) {
    await wakeOnce().catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
  }
})();

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
out({ ev: "ready" });

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const cmd = line.trim();
  try {
    if (cmd === "status") out(await status());
    else if (cmd === "reload") {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      out({ ev: "reloaded" });
    } else if (cmd === "quit") {
      closing = true;
      await browser.close().catch(() => {});
      out({ ev: "bye" });
      process.exit(0);
    }
  } catch (e) {
    out({ ev: "error", cmd, message: String(e.message || e) });
  }
});
rl.on("close", async () => {
  closing = true;
  await browser.close().catch(() => {});
  process.exit(0);
});
