/* Dayman — Web Audio API synth sounds (no external files) */
let _ctx = null;

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

function ensureResumed() {
  const c = ctx();
  if (c.state === 'suspended') c.resume();
}

function unlockCtx() {
  const c = ctx();
  if (c.state === 'suspended') c.resume();
}

document.addEventListener('pointerdown', unlockCtx, { once: true });
document.addEventListener('touchstart', unlockCtx, { once: true });

function tone(freq, dur, type, vol, detune) {
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;
  gain.gain.setValueAtTime(vol || 0.18, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur);
}

function note(freq, start, dur, type, vol) {
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(vol || 0.15, c.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

/* ---- exported sounds ---- */

export function chime() {
  ensureResumed();
  note(880, 0, 0.18, 'sine', 0.12);
  note(1108, 0.09, 0.22, 'sine', 0.10);
  note(1318, 0.18, 0.30, 'sine', 0.08);
}

export function tick() {
  ensureResumed();
  tone(1200, 0.03, 'sine', 0.06);
}

export function fanfare8bit() {
  ensureResumed();
  const notes = [523, 659, 784, 1047, 784, 1047];
  const durs  = [0.12, 0.12, 0.12, 0.25, 0.08, 0.35];
  let t = 0;
  for (let i = 0; i < notes.length; i++) {
    note(notes[i], t, durs[i], 'square', 0.10);
    t += durs[i] * 0.85;
  }
}

export function levelUp() {
  ensureResumed();
  const notes = [523, 659, 784, 1047, 1318, 1568];
  notes.forEach((f, i) => note(f, i * 0.1, 0.18, 'triangle', 0.13));
}

export function breakStart() {
  ensureResumed();
  note(659, 0, 0.25, 'sine', 0.08);
  note(523, 0.15, 0.30, 'sine', 0.06);
}

export function allDone() {
  ensureResumed();
  fanfare8bit();
  setTimeout(() => chime(), 600);
}

export function splashNote(index) {
  ensureResumed();
  const notes = [523, 587, 659, 740, 831, 880, 988, 1047];
  const freq = notes[index % notes.length];
  note(freq, 0, 0.18, 'triangle', 0.10);
}

export function splashFinal() {
  ensureResumed();
  note(1047, 0, 0.4, 'sine', 0.08);
  note(1318, 0.05, 0.35, 'sine', 0.06);
  note(1568, 0.10, 0.30, 'sine', 0.05);
}
