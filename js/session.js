/* Dayman — session engine: timer, blocks, decisions, visibilitychange. */

import { LS, now, today, toast, mmss, human } from './utils.js';
import { plan, getSession, setSession, getDecRec, setDecRec } from './state.js';
import { speak, getMuted } from './speech.js';
import { parseReply } from './parsing.js';
import { askNotify, requestWakeLock, releaseWakeLock, notify } from './platform.js';
import { tick as tickSfx, breakStart, chime } from './audio.js';
import { showScanlines, hideScanlines } from './confetti.js';

// Late-binding to avoid circular imports with screens.js
var _finishDayFn = null;
export function setFinishDayFn(fn) { _finishDayFn = fn; }
var _buildBlocksFn = null;
export function setBuildBlocksFn(fn) { _buildBlocksFn = fn; }
var _showFn = null;
export function setShowFn(fn) { _showFn = fn; }

var tickTimer = null;

export function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
export function startTick(fn) { stopTick(); tickTimer = setInterval(fn, 250); }
export function getTickTimer() { return tickTimer; }

export function saveSession() {
  var session = getSession();
  if (!session || session.finished) return;
  LS.set('session', session);
}

export function curBlock() {
  var session = getSession();
  return session && session.blocks[session.idx];
}

export function remaining() {
  var session = getSession();
  if (!session) return 0;
  if (session.paused) return session.pausedRemain;
  return session.endAt - now();
}

var RING_C = 553; // 2 * PI * 88

function paint() {
  var session = getSession();
  var r = remaining(), el = document.querySelector('#countdown');
  el.textContent = mmss(Math.max(0, r));
  el.classList.toggle('low', r <= 120000);
  var ring = document.querySelector('#ring-fg');
  if (ring && session) {
    var b = curBlock();
    var totalMs = b ? b.min * 60000 : 1;
    var pct = Math.max(0, Math.min(1, r / totalMs));
    ring.style.strokeDashoffset = RING_C * (1 - pct);
    ring.classList.toggle('low', r <= 120000);
    var dock = document.querySelector('#session-dock');
    if (dock) dock.classList.toggle('expanded', r <= 180000);
  }
}

export function renderSession() {
  var session = getSession();
  var b = curBlock(); if (!b) return;
  var focusBlocks = session.blocks.filter(function (x) { return x.type === 'focus'; });
  var fIdx = session.blocks.slice(0, session.idx + 1).filter(function (x) { return x.type === 'focus'; }).length;
  document.querySelector('#block-kind').textContent = b.type === 'focus' ? 'Focus' : (b.long ? 'Long break' : 'Break');
  document.querySelector('#cur-task').textContent = b.type === 'focus' ? b.name : 'Break';
  document.querySelector('#block-count').textContent = b.type === 'focus'
    ? 'Focus ' + fIdx + ' of ' + focusBlocks.length
    : 'Break · ' + fIdx + ' of ' + focusBlocks.length + ' done';
  var nxt = session.blocks[session.idx + 1];
  document.querySelector('#next-up').textContent = nxt
    ? 'Next: ' + (nxt.type === 'focus' ? nxt.name : (nxt.long ? 'long break' : 'break')) + ' · ' + nxt.min + 'm'
    : 'Next: recap';
  document.querySelector('#screen-session').classList.toggle('paused', !!session.paused);
  document.querySelector('#btn-pause').textContent = session.paused ? 'Resume' : 'Pause';
  document.querySelector('#btn-mute').textContent = getMuted() ? 'Voice off' : 'Voice on';
  document.querySelector('#btn-mute').setAttribute('aria-pressed', getMuted() ? 'true' : 'false');
  paint();
}

function enterBlock(first) {
  var session = getSession();
  var b = curBlock();
  if (!b) { _finishDayFn && _finishDayFn(); return; }
  session.endAt = now() + b.min * 60000;
  session.paused = false; session.pausedRemain = 0; session.awaiting = false;
  session.spoke = {};
  hideDecision();
  renderSession();
  if (b.type === 'focus') {
    tickSfx();
    speak('Starting: ' + b.name + '. You have ' + b.min + ' minutes. Let\'s go.', { interrupt: true });
  } else {
    breakStart();
    speak(b.long
      ? 'Long break. ' + b.min + ' minutes. Step away from the screen completely.'
      : 'Nice work. Take ' + b.min + ' — stand up, look away from the screen.', { interrupt: true });
  }
  saveSession();
}

export function startSession() {
  var blocks = _buildBlocksFn ? _buildBlocksFn() : [];
  if (!blocks.length) { toast('You need at least one task to start.'); return; }
  var session = {
    date: today(),
    blocks: blocks,
    idx: 0,
    endAt: 0,
    pausedRemain: 0,
    paused: false,
    awaiting: false,
    spoke: {},
    actualMs: {},
    ext: {},
    done: {},
    planned: {},
    names: {},
    startedAt: now(),
    startHour: new Date(now()).getHours(),
    longestMs: 0,
    focusMs: 0
  };
  plan.tasks.forEach(function (t) {
    session.planned[t.id] = t.alloc; session.actualMs[t.id] = 0; session.ext[t.id] = 0; session.names[t.id] = t.name;
  });
  setSession(session);
  _showFn && _showFn('session');
  showScanlines();
  askNotify();
  requestWakeLock();
  enterBlock(true);
  startTick(tick);
  saveSession();
}

// ------------------------------------------------ auto-advance on no response
var AUTO_MS = 30000;

function startAuto() {
  var session = getSession();
  if (!session) return;
  session.autoUntil = now() + AUTO_MS;
  document.querySelector('#dec-auto').classList.remove('hidden');
  paintAuto();
}

export function cancelAuto(reason) {
  var session = getSession();
  if (!session || !session.autoUntil) return;
  session.autoUntil = 0;
  document.querySelector('#dec-auto').classList.add('hidden');
  if (reason) document.querySelector('#dec-auto-text').textContent = reason;
  saveSession();
}

export function autoSecsLeft() {
  var session = getSession();
  if (!session || !session.autoUntil) return null;
  return Math.max(0, Math.ceil((session.autoUntil - now()) / 1000));
}

function paintAuto() {
  var session = getSession();
  if (!session || !session.autoUntil) return;
  var left = Math.max(0, session.autoUntil - now());
  document.querySelector('#dec-auto-fill').style.width = Math.max(0, Math.min(100, left / AUTO_MS * 100)) + '%';
  document.querySelector('#dec-auto-text').textContent = 'Done in ' + Math.ceil(left / 1000) + 's';
}

function autoTick() {
  var session = getSession();
  if (!session || !session.autoUntil || !session.awaiting) return;
  paintAuto();
  if (now() >= session.autoUntil) {
    var b = curBlock();
    session.autoUntil = 0;
    document.querySelector('#dec-auto').classList.add('hidden');
    speak('Moving on — ' + (b ? b.name : 'that') + ' marked done.', { interrupt: true });
    toast('Moving on');
    decide('done', null, true);
  }
}

export function tick() {
  var session = getSession();
  if (session && session.awaiting) { autoTick(); return; }
  if (!session || session.awaiting) { if (session && !session.awaiting) paint(); return; }
  var b = curBlock(); if (!b) return;
  if (session.paused) { paint(); return; }
  var r = remaining();
  paint();
  if (b.type === 'focus') {
    if (r <= 600000 && !session.spoke.t10 && b.min > 12) {
      session.spoke.t10 = 1; speak('Ten minutes left on ' + b.name + '.');
    }
    if (r <= 120000 && !session.spoke.t2 && b.min > 3) {
      session.spoke.t2 = 1; speak('Two minutes left — how\'s it going? Are you close?');
    }
  }
  if (r <= 0) blockEnded();
}

export function blockEnded() {
  var session = getSession();
  var b = curBlock();
  creditFocus();
  chime();
  notify(b.type === 'focus' ? 'Time\'s up: ' + b.name : 'Break over', b.type === 'focus' ? 'Done, or need more time?' : 'Back to it.');
  if (b.type === 'focus') {
    session.awaiting = true;
    showDecision();
    var exts = session.ext[b.taskId] || 0;
    var q;
    if (exts >= 2) {
      q = 'You\'ve been on ' + b.name + ' for a while — want to keep going or move on?';
    } else {
      q = 'Time\'s up on ' + b.name + '. Are you done, or do you need more time?';
    }
    document.querySelector('#decision-q').textContent = q;
    speak(q, { interrupt: true });
    startAuto();
    saveSession();
  } else {
    speak('Break\'s over. Back to it.', { interrupt: true });
    advance();
  }
}

export function creditFocus() {
  var session = getSession();
  var b = curBlock(); if (!b || b.type !== 'focus') return;
  var total = Math.max(0, (b.min * 60000) - Math.max(0, remaining()));
  var delta = Math.max(0, total - (b.creditedMs || 0));
  b.creditedMs = total;
  session.actualMs[b.taskId] = (session.actualMs[b.taskId] || 0) + delta;
  session.focusMs += delta;
  if (total > (session.longestMs || 0)) session.longestMs = total;
}

export function prune() {
  var session = getSession();
  var b = session.blocks, out = [];
  for (var i = 0; i < b.length; i++) {
    if (i > session.idx && b[i].type === 'break') {
      var prev = out[out.length - 1];
      var moreFocus = b.slice(i + 1).some(function (x) { return x.type === 'focus'; });
      if (!prev || prev.type === 'break' || !moreFocus) continue;
    }
    out.push(b[i]);
  }
  session.blocks = out;
}

export function advance() {
  var session = getSession();
  session.idx++;
  if (session.idx >= session.blocks.length) { if (_finishDayFn) _finishDayFn(); return; }
  enterBlock();
}

export function showDecision() {
  var d = document.querySelector('#decision'); d.classList.remove('hidden');
  document.querySelector('#session-dock').classList.add('hidden');
  document.querySelector('#dec-live').textContent = '';
  var dc = document.querySelector('#dcustom');
  if (dc) dc.classList.remove('show');
  var toggle = document.querySelector('#btn-dec-custom-toggle');
  if (toggle) toggle.textContent = 'More options';
}

export function hideDecision() {
  var session = getSession();
  if (session) session.autoUntil = 0;
  document.querySelector('#dec-auto').classList.add('hidden');
  var d = document.querySelector('#decision');
  d.classList.add('hiding');
  setTimeout(function () { d.classList.add('hidden'); d.classList.remove('hiding'); }, 180);
  document.querySelector('#session-dock').classList.remove('hidden');
  var decRec = getDecRec();
  if (decRec) { try { decRec.stop(); } catch (e) {} setDecRec(null); }
  document.querySelector('#btn-mic-dec').classList.remove('on');
}

export function decide(kind, min, auto) {
  var session = getSession();
  if (!session) return;
  var b = curBlock();
  if (kind === 'done') {
    hideDecision(); session.awaiting = false;
    session.done[b.taskId] = true;
    if (!auto) speak(b.name + ' done. Nice.', { interrupt: true });
    session.blocks = session.blocks.filter(function (x, i) {
      return i <= session.idx || !(x.type === 'focus' && x.taskId === b.taskId);
    });
    prune();
    advance();
  } else {
    var add = Math.max(1, Math.min(180, min || 5));
    session.ext[b.taskId] = (session.ext[b.taskId] || 0) + 1;
    b.min += add;
    session.awaiting = false;
    session.endAt = now() + add * 60000;
    session.spoke = { t10: 1, t2: add <= 2 ? 1 : 0 };
    hideDecision(); renderSession();
    speak(add + ' more minutes on ' + b.name + '. Go.', { interrupt: true });
  }
  saveSession();
}

export function moreTimeNow() {
  var b = curBlock(); if (!b) return;
  var session = getSession();
  b.min += 5; session.endAt += 5 * 60000;
  if (b.type === 'focus') session.ext[b.taskId] = (session.ext[b.taskId] || 0) + 1;
  session.spoke.t2 = 0;
  renderSession();
  speak('Five more minutes added.', { interrupt: true });
  toast('+5 minutes');
  saveSession();
}

// ---- visibilitychange (moved here to break Platform <-> Session cycle) ----
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  var session = getSession();
  if (!session || document.body.dataset.screen !== 'session') return;
  requestWakeLock();
  var r = remaining();
  if (r <= 0 && !session.awaiting) {
    var late = Math.round(-r / 60000);
    var b = curBlock();
    blockEnded();
    if (b && b.type === 'focus' && late >= 1) {
      speak('Welcome back. Time ran out on ' + b.name + ' about ' + late + ' minute' + (late === 1 ? '' : 's') + ' ago.');
    }
  } else {
    renderSession();
  }
});
