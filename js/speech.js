/* Dayman — Web Speech API: synthesis + recognition. */

import { LS, now } from './utils.js';

export var speechLog = [];

var voice = null, voiceReady = false, audioUnlocked = false;
var _muted = LS.get('muted', false);
export function getMuted() { return _muted; }
export function setMuted(v) { _muted = v; LS.set('muted', v); }

function pickVoice() {
  if (!window.speechSynthesis) return;
  var vs = speechSynthesis.getVoices() || [];
  if (!vs.length) return;
  var en = vs.filter(function (v) { return /^en/i.test(v.lang || ''); });
  var pref = ['Google UK English Female', 'Samantha', 'Google US English', 'Karen', 'Moira', 'en-GB'];
  for (var i = 0; i < pref.length; i++) {
    var m = en.filter(function (v) { return (v.name + ' ' + v.lang).indexOf(pref[i]) >= 0; })[0];
    if (m) { voice = m; voiceReady = true; return; }
  }
  voice = en[0] || vs[0]; voiceReady = true;
}

if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function speak(text, opts) {
  opts = opts || {};
  speechLog.push({ t: now(), text: text });
  if (speechLog.length > 200) speechLog.shift();
  if (_muted || !window.speechSynthesis) return;
  try {
    if (opts.interrupt) speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 1; u.volume = 1; u.lang = (voice && voice.lang) || 'en-US';
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch (e) {}
}

export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  if (!voiceReady) pickVoice();
  try {
    if (window.speechSynthesis) {
      var u = new SpeechSynthesisUtterance(' ');
      u.volume = 0; speechSynthesis.speak(u);
    }
  } catch (e) {}
}

document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function listen(o) {
  if (!SR) { o.onState && o.onState('unavailable'); return null; }
  var rec;
  try { rec = new SR(); } catch (e) { o.onState && o.onState('unavailable'); return null; }
  rec.lang = 'en-US'; rec.continuous = !!o.continuous; rec.interimResults = true;
  rec.onstart = function () { o.onState && o.onState('listening'); };
  rec.onerror = function (e) { o.onState && o.onState('error:' + (e.error || '')); };
  rec.onend = function () { o.onState && o.onState('ended'); };
  var lastIdx = 0;
  rec.onresult = function (e) {
    var fin = '', part = '';
    for (var i = lastIdx; i < e.results.length; i++) {
      var r = e.results[i];
      if (r.isFinal) fin += r[0].transcript;
      else part = r[0].transcript;
    }
    lastIdx = e.results.length;
    if (part) o.onPartial && o.onPartial(part);
    if (fin) o.onFinal && o.onFinal(fin.trim());
  };
  try { rec.start(); } catch (e) { o.onState && o.onState('error:start'); }
  return rec;
}
