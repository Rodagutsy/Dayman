/* Dayman — shared utilities. Pure functions, zero imports. */

export var $ = function (s, r) { return (r || document).querySelector(s); };
export var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

export var LS = {
  get: function (k, d) {
    try { var v = localStorage.getItem('dayspeak.' + k); return v ? JSON.parse(v) : d; }
    catch (e) { return d; }
  },
  set: function (k, v) {
    try { localStorage.setItem('dayspeak.' + k, JSON.stringify(v)); } catch (e) {}
  }
};

var TEST = /(?:\?|&)test=1/.test(location.search);

var warp = 0;
export function setWarp(ms) { warp += ms; }
export function getWarp() { return warp; }
export function now() { return Date.now() + warp; }

export function pad(n) { return (n < 10 ? '0' : '') + n; }

export function clockOf(ms) {
  var d = new Date(ms), h = d.getHours(), m = d.getMinutes();
  var ap = h >= 12 ? 'pm' : 'am', hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + pad(m) + ' ' + ap;
}

export function mmss(ms) {
  if (ms < 0) ms = 0;
  var t = Math.round(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  return (m < 60 ? m : Math.floor(m / 60) + ':' + pad(m % 60)) + ':' + pad(s);
}

export function human(min) {
  min = Math.round(min);
  if (min < 60) return min + 'm';
  var h = Math.floor(min / 60), m = min % 60;
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

export function today() {
  var d = new Date(now());
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function prettyDate(iso) {
  var p = iso.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
  try {
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (e) { return iso; }
}

export function uid() { return Math.random().toString(36).slice(2, 9); }

var toastT;
export function toast(msg) {
  var el = document.querySelector('#toast');
  el.textContent = msg; el.classList.remove('hidden', 'hiding');
  clearTimeout(toastT); toastT = setTimeout(function () {
    el.classList.add('hiding');
    setTimeout(function () { el.classList.add('hidden'); el.classList.remove('hiding'); }, 200);
  }, 2600);
}
