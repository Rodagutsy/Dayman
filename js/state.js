/* Dayman — shared mutable state + decRec lifted from wiring. */

import { LS } from './utils.js';

export var plan = {
  budget: 180,
  tech: 'pomodoro',
  customFocus: 30,
  customBreak: 7,
  tasks: []
};

var _session = null;
export function getSession() { return _session; }
export function setSession(v) { _session = v; }

var _decRec = null;
export function getDecRec() { return _decRec; }
export function setDecRec(v) { _decRec = v; }

export function history() { return LS.get('history', {}); }

export function averages() {
  var h = history(), acc = {};
  Object.keys(h).forEach(function (d) {
    (h[d].tasks || []).forEach(function (t) {
      var k = (t.name || '').trim().toLowerCase();
      if (!k || !t.actual) return;
      acc[k] = acc[k] || { name: t.name, total: 0, n: 0 };
      acc[k].total += t.actual; acc[k].n++;
    });
  });
  Object.keys(acc).forEach(function (k) { acc[k].avg = Math.round(acc[k].total / acc[k].n); });
  return acc;
}
