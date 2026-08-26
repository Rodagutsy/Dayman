/* Dayspeak — gamification: XP, levels, badges, streaks. */

import { pad, now, today, LS } from './utils.js';
import { history } from './state.js';

var XP = {
  PER_TASK: 10,
  PER_MINUTE: 1,
  ALL_DONE_BONUS: 25,
  STREAK_PER_DAY: 5,
  STREAK_CAP: 50
};

export function xpForDay(rec, streakDays) {
  var tasks = rec.tasks || [];
  var completed = tasks.filter(isDone).length;
  var minutes = Math.max(0, Math.round(rec.focus || 0));
  var parts = [];
  var taskXp = completed * XP.PER_TASK;
  var minXp = minutes * XP.PER_MINUTE;
  parts.push({ label: completed + ' task' + (completed === 1 ? '' : 's') + ' completed', xp: taskXp });
  parts.push({ label: minutes + ' focused minute' + (minutes === 1 ? '' : 's'), xp: minXp });
  var bonus = 0;
  if (tasks.length && completed === tasks.length) {
    bonus = XP.ALL_DONE_BONUS;
    parts.push({ label: 'Completed every task', xp: bonus });
  }
  var streakXp = 0;
  if (completed > 0 && streakDays > 0) {
    streakXp = Math.min(XP.STREAK_CAP, streakDays * XP.STREAK_PER_DAY);
    parts.push({ label: streakDays + '-day streak bonus', xp: streakXp });
  }
  var total = taskXp + minXp + bonus + streakXp;
  return { total: total, parts: parts };
}

function isDone(t) {
  if (typeof t.done === 'boolean') return t.done;
  return (t.actual || 0) > 0;
}

export function dayCounts(rec) {
  var tasks = (rec && rec.tasks) || [];
  return {
    planned: tasks.length,
    completed: tasks.filter(isDone).length,
    focus: Math.max(0, Math.round((rec && rec.focus) || 0)),
    ext: Math.max(0, (rec && rec.ext) || 0),
    longest: Math.max(0, Math.round((rec && rec.longest) || 0)),
    startHour: rec && typeof rec.startHour === 'number' ? rec.startHour : null
  };
}

export function dayActive(rec) { return dayCounts(rec).completed > 0; }

export function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function dateOf(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function shiftIso(iso, days) {
  var d = dateOf(iso); d.setDate(d.getDate() + days); return isoOf(d);
}
export function lastDays(n, endIso) {
  var out = [], e = endIso || today();
  for (var i = n - 1; i >= 0; i--) out.push(shiftIso(e, -i));
  return out;
}

export function streakOf(h, endIso) {
  h = h || history();
  var cur = endIso || today();
  if (!dayActive(h[cur])) {
    cur = shiftIso(cur, -1);
    if (!dayActive(h[cur])) return 0;
  }
  var n = 0;
  while (dayActive(h[cur])) { n++; cur = shiftIso(cur, -1); }
  return n;
}

export function streakAtRisk(h) {
  h = h || history();
  if (dayActive(h[today()])) return false;
  if (streakOf(h) < 1) return false;
  return new Date(now()).getHours() >= 17;
}

var TIERS = [
  { xp: 0, name: 'Spark' }, { xp: 120, name: 'Ember' }, { xp: 300, name: 'Steady' },
  { xp: 600, name: 'Focused' }, { xp: 1000, name: 'Deep Work' }, { xp: 1600, name: 'Relentless' },
  { xp: 2400, name: 'Craftsman' }, { xp: 3500, name: 'Operator' }, { xp: 5000, name: 'Luminary' },
  { xp: 7000, name: 'Timekeeper' }
];

export function totalXp(h) {
  h = h || history();
  var dates = Object.keys(h).sort(), sum = 0;
  dates.forEach(function (d) {
    sum += xpForDay(h[d], streakOf(h, d)).total;
  });
  return sum;
}

export function levelOf(xp) {
  var i = 0;
  for (var k = 0; k < TIERS.length; k++) if (xp >= TIERS[k].xp) i = k;
  var cur = TIERS[i], nxt = TIERS[i + 1] || null;
  var into = xp - cur.xp;
  var span = nxt ? nxt.xp - cur.xp : 1;
  return {
    level: i + 1, name: cur.name, xp: xp,
    next: nxt, need: nxt ? nxt.xp - xp : 0,
    pct: nxt ? Math.max(2, Math.min(100, Math.round(into / span * 100))) : 100
  };
}

export var BADGES = [
  { id: 'first', name: 'First day down', crit: 'Finish your first day',
    test: function (s) { return s.activeDays >= 1; } },
  { id: 'streak3', name: '3-day streak', crit: 'Focus three days in a row',
    test: function (s) { return s.bestStreak >= 3; } },
  { id: 'streak7', name: '7-day streak', crit: 'Focus seven days in a row',
    test: function (s) { return s.bestStreak >= 7; } },
  { id: 'five', name: 'Five in a day', crit: 'Complete 5 tasks in one day',
    test: function (s) { return s.maxTasksDay >= 5; } },
  { id: 'fourh', name: 'Four hour day', crit: '4 focused hours in one day',
    test: function (s) { return s.maxFocusDay >= 240; } },
  { id: 'noext', name: 'Clean run', crit: 'A day with zero overruns',
    test: function (s) { return s.cleanDays >= 1; } },
  { id: 'early', name: 'Early start', crit: 'Start a day before 8am',
    test: function (s) { return s.earliest !== null && s.earliest < 8; } },
  { id: 'tasks20', name: '20 tasks', crit: 'Complete 20 tasks all-time',
    test: function (s) { return s.totalTasks >= 20; } },
  { id: 'hours10', name: '10 hours deep', crit: '10 focused hours all-time',
    test: function (s) { return s.totalFocus >= 600; } },
  { id: 'week5', name: 'Full week', crit: '5 active days in one week',
    test: function (s) { return s.bestWeekDays >= 5; } }
];

function badgeStats(h) {
  h = h || history();
  var dates = Object.keys(h).sort();
  var s = {
    activeDays: 0, totalTasks: 0, totalFocus: 0, maxTasksDay: 0, maxFocusDay: 0,
    cleanDays: 0, earliest: null, bestStreak: 0, bestWeekDays: 0
  };
  var weeks = {};
  dates.forEach(function (d) {
    var c = dayCounts(h[d]);
    if (c.completed > 0) {
      s.activeDays++;
      var wk = weekKey(d);
      weeks[wk] = (weeks[wk] || 0) + 1;
    }
    s.totalTasks += c.completed;
    s.totalFocus += c.focus;
    if (c.completed > s.maxTasksDay) s.maxTasksDay = c.completed;
    if (c.focus > s.maxFocusDay) s.maxFocusDay = c.focus;
    if (c.completed > 0 && c.ext === 0) s.cleanDays++;
    if (c.startHour !== null && c.completed > 0 && (s.earliest === null || c.startHour < s.earliest)) s.earliest = c.startHour;
    var st = streakOf(h, d);
    if (st > s.bestStreak) s.bestStreak = st;
  });
  Object.keys(weeks).forEach(function (k) { if (weeks[k] > s.bestWeekDays) s.bestWeekDays = weeks[k]; });
  return s;
}

function weekKey(iso) {
  var d = dateOf(iso), dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return isoOf(d);
}

export function earnedBadges(h) {
  var s = badgeStats(h);
  return BADGES.filter(function (b) { try { return !!b.test(s); } catch (e) { return false; } })
    .map(function (b) { return b.id; });
}

export function checkUnlocks() {
  var h = history();
  var have = earnedBadges(h);
  var seen = LS.get('badges', []);
  var fresh = have.filter(function (id) { return seen.indexOf(id) < 0; });
  LS.set('badges', have);
  return fresh.map(function (id) {
    return BADGES.filter(function (b) { return b.id === id; })[0];
  }).filter(Boolean);
}

export function localStanding(h) {
  h = h || history();
  var dates = Object.keys(h).sort();
  if (!dates.length) return null;
  var span = Math.max(1, Math.round((dateOf(today()) - dateOf(dates[0])) / 86400000) + 1);
  var active = dates.filter(function (d) { return dayActive(h[d]); }).length;
  var consistency = Math.min(100, Math.round(active / span * 100));
  var xp = totalXp(h);
  return { consistency: consistency, span: span, active: active, xp: xp };
}
