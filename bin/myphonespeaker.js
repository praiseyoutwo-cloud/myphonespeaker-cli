#!/usr/bin/env node
// MyPhoneSpeaker CLI: writes the site's water-eject tone as a WAV file for your phone, prints
// wet-phone first aid, runs a drying timer and opens the browser tools on myphonespeaker.com.
// No dependencies. Tone parameters come from data/protocol.json, the same file the site reads.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
const pkg = load('package.json');
const protocol = load('data/protocol.json');
const tools = load('data/tools.json');
const firstAid = load('data/firstAid.json');

const SITE = 'https://myphonespeaker.com';
const RATE = 44100;

const HELP = `myphonespeaker ${pkg.version}
Water eject tone, speaker check and wet phone first aid from ${SITE}

Usage: myphonespeaker <command> [options]

Commands:
  eject [--out file.wav] [--resonance]   Write the water eject tone as a WAV file for your phone
  check [--out file.wav]                 Write the before/after listening sweep as a WAV file
  first-aid [--sources]                  Print what to do when a phone gets wet, in order
  timer [minutes]                        Count down the drying time before cable charging
  tools                                  List the free browser tools on ${SITE}
  open [tool-id]                         Open a tool in your browser (default: water-eject)

Options:
  -h, --help       Show this help
  -v, --version    Show the version

The tone only works when it plays from the phone's own speaker. Send the WAV file to your
phone and play it there at full volume, or open ${SITE}/ in the phone's browser.`;

// ---------- WAV ----------

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}

// Linear ramp in and out, the same gate shape as the site engine.
function gate(i, n, rampN) {
  return Math.min(1, i / rampN, (n - i) / rampN);
}

function sine(out, at, seconds, hz, peak, ramp) {
  const n = Math.round(seconds * RATE), r = Math.max(1, Math.round(ramp * RATE)), s = Math.round(at * RATE);
  for (let i = 0; i < n; i++) out[s + i] = peak * gate(i, n, r) * Math.sin((2 * Math.PI * hz * i) / RATE);
}

// Exponential sweep f0 -> f1 over `seconds`, repeated, under one gate (as engine.resonancePass and check).
function sweep(out, at, seconds, repeats, f0, f1, peak, ramp) {
  const T = seconds, k = Math.log(f1 / f0), per = Math.round(T * RATE), n = per * repeats;
  const r = Math.max(1, Math.round(ramp * RATE)), s = Math.round(at * RATE);
  for (let i = 0; i < n; i++) {
    const t = (i % per) / RATE;
    const phase = ((2 * Math.PI * f0 * T) / k) * (Math.exp((k * t) / T) - 1);
    out[s + i] = peak * gate(i, n, r) * Math.sin(phase);
  }
}

function ejectTone(withResonance) {
  const w = protocol.water;
  const cycleLen = w.pulsesPerCycle * (w.pulseOnSeconds + w.pulseOffSeconds);
  let total = w.cycles * cycleLen + (w.cycles - 1) * w.betweenCycleSeconds;
  const r = protocol.resonancePass;
  const resAt = total + 1;
  if (withResonance) total = resAt + r.sweepSeconds * r.repeats + 0.5;
  const out = new Float32Array(Math.ceil(total * RATE) + 1);
  const hzList = [];
  for (let c = 0; c < w.cycles; c++) {
    const cycleStart = c * (cycleLen + w.betweenCycleSeconds);
    for (let i = 0; i < w.pulsesPerCycle; i++) {
      const hz = Math.round(w.frequencyStartHz + ((w.frequencyEndHz - w.frequencyStartHz) * i) / Math.max(1, w.pulsesPerCycle - 1));
      if (c === 0) hzList.push(hz);
      sine(out, cycleStart + i * (w.pulseOnSeconds + w.pulseOffSeconds), w.pulseOnSeconds, hz, w.peakGain, w.rampSeconds);
    }
  }
  if (withResonance) sweep(out, resAt, r.sweepSeconds, r.repeats, r.sweepFromHz, r.sweepToHz, r.peakGain, r.rampSeconds);
  return { out, total, hzList };
}

function checkSweep() {
  const c = protocol.check;
  const out = new Float32Array(Math.ceil((c.sweepSeconds + 0.5) * RATE));
  sweep(out, 0.25, c.sweepSeconds, 1, c.sweepFromHz, c.sweepToHz, c.peakGain, c.rampSeconds);
  return out;
}

// ---------- commands ----------

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith('-')) fail(`${name} needs a value`);
  return v;
}

function fail(msg) {
  console.error(`myphonespeaker: ${msg}\nRun "myphonespeaker --help" for usage.`);
  process.exit(1);
}

function eject(args) {
  const file = resolve(flag(args, '--out') ?? 'water-eject-tone.wav');
  const withRes = args.includes('--resonance');
  const w = protocol.water;
  const { out, total, hzList } = ejectTone(withRes);
  writeFileSync(file, wav(out));
  console.log(`Wrote ${file} (${total.toFixed(1)} s, mono 16-bit ${RATE} Hz)

What it plays: ${w.cycles} cycles of ${w.pulsesPerCycle} sine pulses, ${hzList[0]}-${hzList.at(-1)} Hz,
${w.pulseOnSeconds} s on / ${w.pulseOffSeconds} s off, ${w.betweenCycleSeconds} s pause between cycles.${withRes ? `
Then the experimental resonance sweep ${protocol.resonancePass.sweepFromHz}-${protocol.resonancePass.sweepToHz} Hz.` : ''}

How to use it:
  1. Send the file to your phone and play it there. Laptop speakers do not help a phone.
  2. Take off the case. Set the volume to full. Hold the phone speaker side down.
  3. In the pauses, let water drip out and wipe the grille gently with a dry cloth.

It helps only with a muffled speaker after a splash. It does not dry the inside of a phone.
If the phone was under water, will not turn on, or got salt water or a sugary drink on it,
run "myphonespeaker first-aid" first.

Guided version with a before/after check: ${SITE}/`);
}

function check(args) {
  const file = resolve(flag(args, '--out') ?? 'speaker-check-sweep.wav');
  const c = protocol.check;
  writeFileSync(file, wav(checkSweep()));
  console.log(`Wrote ${file} (${c.sweepFromHz}-${c.sweepToHz} Hz sweep, ${c.sweepSeconds} s)

Play it on your phone before and after the water eject tone. A clean rise with no buzz or
rattle is a good sign. Full speaker and earpiece test: ${SITE}/speaker-check/`);
}

function printFirstAid(args) {
  const fa = firstAid;
  const ref = (src) => (src?.length ? ` [${src.join(', ')}]` : '');
  console.log(`${fa.skipTitle}`);
  for (const s of fa.skip) console.log(`  - ${s}`);
  console.log(`${fa.skipNote}\n\n${fa.stepsTitle}:`);
  fa.steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.t}${ref(s.src)}`));
  if (args.includes('--sources')) {
    console.log('\nSources:');
    fa.sources.forEach((s, i) => console.log(`  [${i + 1}] ${s.label}\n      ${s.url}`));
  } else {
    console.log('\nNumbers in brackets are sources. Add --sources to list them.');
  }
  console.log(`Full guide: ${SITE}/wet-phone-first-aid/`);
}

function timer(args) {
  const d = protocol.dryingTimer;
  const minutes = args[0] === undefined ? d.recommendedMinutes : Number(args[0]);
  if (!Number.isFinite(minutes) || minutes <= 0) fail('timer needs a number of minutes, for example: timer 300');
  console.log(`Drying timer: ${minutes} min. Keep the phone unplugged, in a dry place with airflow.`);
  if (minutes < d.minimumMinutes) console.log(`Note: ${minutes} min is shorter than the ${d.minimumMinutes} min minimum.`);
  console.log(`Apple's rule for a wet iPhone is at least ${d.recommendedMinutes / 60} hours before cable charging. Ctrl+C stops.\n`);
  const end = Date.now() + minutes * 60_000;
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
    process.stdout.write(`\r  ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left `);
    if (left === 0) {
      clearInterval(id);
      console.log(`\x07\n\nDone. If no liquid alert shows, you can try cable charging now.\nChecklist: ${SITE}/wet-phone-checklist/`);
    }
  };
  const id = setInterval(tick, 1000);
  tick();
}

function listTools() {
  const w = Math.max(...tools.map((t) => t.id.length));
  for (const t of tools) console.log(`  ${t.id.padEnd(w)}  ${t.name}\n  ${' '.repeat(w)}  ${SITE}${t.path}`);
  console.log('\nOpen one with: myphonespeaker open <tool-id>');
}

function open(args) {
  const id = args[0] ?? 'water-eject';
  const t = tools.find((x) => x.id === id);
  if (!t) fail(`unknown tool "${id}". Run "myphonespeaker tools" for the list.`);
  const url = SITE + t.path;
  const [cmd, cmdArgs] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`Open this link in your browser: ${url}`));
  child.unref();
  console.log(`Opening ${t.name}: ${url}`);
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'eject': eject(args); break;
  case 'check': check(args); break;
  case 'first-aid': printFirstAid(args); break;
  case 'timer': timer(args); break;
  case 'tools': listTools(); break;
  case 'open': open(args); break;
  case '-v': case '--version': console.log(pkg.version); break;
  case undefined: case '-h': case '--help': case 'help': console.log(HELP); break;
  default: fail(`unknown command "${cmd}"`);
}
