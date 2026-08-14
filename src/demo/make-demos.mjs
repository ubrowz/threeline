// Regenerate the notation on the landing page.
//
// The three demos are the editor's own SVG output, and the playable one also
// needs the editor's play plan (what to sound, and when). Rather than draw any
// of that by hand, this drives the real editor in headless Chrome and takes
// what it produces — so the page can never show notation the editor wouldn't.
//
// Only needed when the editor's rendering or playback changes; the results are
// committed, so a normal `python3 build.py` does not require this.
//
//     node src/demo/make-demos.mjs
//     CHROME=/path/to/chrome node src/demo/make-demos.mjs
//
// Needs Node 22+ (for the built-in WebSocket) and a Chrome on the machine.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR = resolve(HERE, "../../bass-notation.html");
const CHROME =
  process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

// --- the demos themselves -------------------------------------------------

// A phrase carrying most of the vocabulary at once: lengths, a rest, ghost
// notes, a triplet, a slide, a hammer-on, a tie, chords and a repeat.
const PLAYER_BAR = `
  const n = newNote, sec = newSection("");
  sec.notes = [
    n({dur:"q",  string:0, fret:5, chord:"Am", repStart:true}),
    n({dur:"e",  string:0, fret:5, dead:true}),
    n({dur:"e",  string:0, fret:5}),
    n({dur:"e",  string:0, fret:5, tup:3}),
    n({dur:"e",  string:1, fret:2, tup:3}),
    n({dur:"e",  string:1, fret:3, tup:3}),
    n({dur:"e",  rest:true}),
    n({dur:"e",  string:1, fret:2, link:"slide"}),
    n({dur:"q",  dots:1, string:1, fret:3, chord:"C", repEnd:true, repTimes:2}),
    n({dur:"e",  string:1, fret:5, link:"legato"}),
    n({dur:"q",  string:1, fret:7, tie:true}),
    n({dur:"q",  string:1, fret:7})
  ];
  song = { version:1, title:"", artist:"", timeSig:{beats:4,unit:4},
           naming:"nl", tempo:96, followRepeats:true, barsPerLine:"2",
           octaves:"off", sections:[sec] };
  entry = {dur:"q", dots:0, string:1};
  playRate = 1;
`;

// The chords-first workflow: the same bars before and after the notes go in.
const SKETCH = `[Verse] Am | C | G G7 | Dm`;
const SKETCH_LINE = [
  [0, 5], [0, 5], [1, 3], [1, 7],   // Am
  [1, 3], [1, 3], [1, 7], [1, 10],  // C
  [0, 3], [0, 3], [1, 2], [0, 1],   // G, G7
  [1, 5], [1, 5], [0, 1], [0, 5],   // Dm
];

// --- chrome plumbing ------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page" && t.url.includes("bass-notation"));
      if (page) return page;
    } catch {}
    await wait(250);
  }
  throw new Error("Chrome did not come up — set CHROME=/path/to/chrome");
}

const chrome = spawn(CHROME, [
  "--headless",
  "--disable-gpu",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "threeline-"))}`,
  `file://${EDITOR.replace(/ /g, "%20")}`,
], { stdio: "ignore" });

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});

function evaluate(expression) {
  const i = ++id;
  ws.send(JSON.stringify({
    id: i, method: "Runtime.evaluate",
    params: { expression, returnByValue: true },
  }));
  return new Promise((res, rej) => pending.set(i, (m) => {
    if (m.result?.exceptionDetails) rej(new Error(JSON.stringify(m.result.exceptionDetails)));
    else res(m.result.result.value);
  }));
}

// --- take what the editor draws -------------------------------------------

// Chrome reports the page as a target before its script has parsed, so wait
// until the editor is actually there. Without this the run fails at random,
// depending on how long the file takes to load.
for (let i = 0; ; i++) {
  const ready = await evaluate(`typeof newNote === "function" && typeof buildPlan === "function"`);
  if (ready) break;
  if (i > 60) throw new Error("the editor never finished loading");
  await wait(100);
}

const out = await evaluate(`(() => {
  ${PLAYER_BAR}
  cursor = {sec:0, i:-1}; selAnchor = null;
  render();
  const plan = buildPlan(0, timeline().length - 1);
  const player = {
    svg: document.querySelector(".system svg").outerHTML,
    events: plan.events.map(e => ({
      t:+e.t.toFixed(4), d:+e.dur.toFixed(4), m:e.midi,
      x:e.dead?1:0, s:e.soft?1:0, f:e.from||0, i:e.i
    })),
    steps: plan.steps.map(s => ({ t:+s.t.toFixed(4), i:s.i })),
    total: +plan.total.toFixed(4)
  };

  const sketch = () => {
    song = { version:1, title:"", artist:"", timeSig:{beats:4,unit:4},
             naming:"nl", tempo:90, followRepeats:true, barsPerLine:"4",
             octaves:"off", sections:[newSection("")] };
    entry = {dur:"q", dots:0, string:1};
    cursor = {sec:0, i:-1}; selAnchor = null;
    applySketch(${JSON.stringify(SKETCH)});
    cursor = {sec:0, i:-1};
    render();
  };

  sketch();
  const chart = document.querySelector(".system svg").outerHTML;

  sketch();
  const notes = song.sections[0].notes;
  ${JSON.stringify(SKETCH_LINE)}.forEach(([s, f], k) => {
    notes[k].rest = false; notes[k].string = s; notes[k].fret = f;
  });
  cursor = {sec:0, i:-1};
  render();
  const filled = document.querySelector(".system svg").outerHTML;

  return { player, chart, filled, bars: splitMeasures(notes).length };
})()`);

writeFileSync(join(HERE, "player.svg"), out.player.svg);
writeFileSync(join(HERE, "player.json"), JSON.stringify({
  events: out.player.events, steps: out.player.steps, total: out.player.total,
}, null, 1));
writeFileSync(join(HERE, "sketch-chart.svg"), out.chart);
writeFileSync(join(HERE, "sketch-filled.svg"), out.filled);

console.log(`player       ${out.player.events.length} notes to sound, ${out.player.total}s`);
console.log(`sketch       ${out.bars} bars`);
console.log("written to src/demo — now run: python3 build.py");

ws.close();
chrome.kill();
process.exit(0);
