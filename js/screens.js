/* Dayman — all screen rendering, shared UI helpers, buildBlocks. */

import { $, $$, LS, now, today, prettyDate, human, clockOf, uid } from './utils.js';
import { plan, getSession, setSession, history, averages } from './state.js';
import { parseTasks, durationHint, cleanName } from './parsing.js';
import { speak } from './speech.js';
import { releaseWakeLock } from './platform.js';
import {
  xpForDay, streakOf, checkUnlocks, dayCounts, dayActive,
  totalXp, levelOf, lastDays, shiftIso, dateOf, isoOf,
  earnedBadges, BADGES, localStanding, streakAtRisk
} from './gamification.js';
import { stopTick, setFinishDayFn, setBuildBlocksFn, setShowFn } from './session.js';
import { hideScanlines, burst, levelUpFlash } from './confetti.js';
import { allDone, fanfare8bit, levelUp } from './audio.js';
import { syncUp } from './sync.js';

var TECHS = {
  pomodoro: { name: 'Pomodoro', focus: 25, brk: 5, longEvery: 4, longBrk: 15 },
  '5217': { name: '52 / 17', focus: 52, brk: 17, longEvery: 0, longBrk: 0 },
  deep: { name: 'Deep Blocks', focus: 50, brk: 10, longEvery: 0, longBrk: 0 },
  custom: { name: 'Custom', focus: 30, brk: 7, longEvery: 0, longBrk: 0 }
};

// ---- screen helper ----
export function show(name) {
  var old = $$('.screen:not(.hidden)');
  old.forEach(function (s) {
    if (s.dataset.screen === name) return;
    s.classList.add('exiting');
    s.addEventListener('animationend', function handler() {
      s.classList.remove('exiting'); s.classList.add('hidden');
      s.removeEventListener('animationend', handler);
    });
  });
  var target = $('#screen-' + name);
  if (target) { target.classList.remove('hidden', 'exiting'); }
  var b = target ? target.querySelector('.body') : null; if (b) b.scrollTop = 0;
  document.body.dataset.screen = name;
  updateBottomNav(name);
}

var NAV_SCREENS = ['plan', 'progress', 'rewards', 'settings'];
function updateBottomNav(name) {
  var nav = $('#bottom-nav');
  if (!nav) return;
  var hide = NAV_SCREENS.indexOf(name) < 0;
  nav.classList.toggle('hidden', hide);
  $$('.nav-tab', nav).forEach(function (t) {
    t.classList.toggle('is-on', t.dataset.screen === name);
  });
}

// ---- shared UI helpers ----
function statRow(items) {
  var d = document.createElement('div'); d.className = 'stat-row';
  items.forEach(function (it) {
    var s = document.createElement('div'); s.className = 'stat';
    s.innerHTML = '<b></b><i></i>';
    var bEl = $('b', s);
    bEl.textContent = it.v;
    if (String(it.v).length > 5) bEl.className = 'long';
    $('i', s).textContent = it.l;
    d.appendChild(s);
  });
  return d;
}

function sec(title) {
  var s = document.createElement('div'); s.className = 'psec';
  if (title) { var h = document.createElement('h3'); h.textContent = title; s.appendChild(h); }
  return s;
}

function verdictEl(text) {
  var v = document.createElement('div'); v.className = 'verdict'; v.textContent = text; return v;
}

function emptyEl(text) {
  var p = document.createElement('p'); p.className = 'empty'; p.textContent = text; return p;
}

// ---- observation (used by both Recap and Progress) ----
function observation(rec) {
  var lines = [];
  var worst = null;
  rec.tasks.forEach(function (t) {
    if (!t.actual) return;
    var d = t.actual - t.planned;
    if (!worst || d > worst.d) worst = { t: t, d: d };
  });
  if (worst && worst.d >= 5) {
    lines.push(worst.t.name + ' took ~' + worst.t.actual + ' min — you planned ' + worst.t.planned + '. Try ' + (Math.ceil(worst.t.actual / 5) * 5) + ' next time.');
  } else if (rec.focus === 0) {
    lines.push('No focused time today — shorter blocks might help tomorrow.');
  } else {
    lines.push('You landed close to plan — ' + human(rec.focus) + ' focused with ' + rec.ext + ' overrun' + (rec.ext === 1 ? '' : 's') + '. Keep the same block size.');
  }
  var skipped = rec.tasks.filter(function (t) { return !t.actual; });
  if (skipped.length) lines.push('Skipped: ' + skipped.map(function (t) { return t.name; }).join(', ') + '.');
  return lines.join(' ');
}

// ================================================================ PLAN
export function currentTech() {
  var t = Object.assign({}, TECHS[plan.tech]);
  if (plan.tech === 'custom') {
    t.focus = Math.max(5, parseInt($('#tech-focus').value, 10) || 30);
    t.brk = Math.max(0, parseInt($('#tech-break').value, 10) || 0);
  }
  return t;
}

export function refreshHints() {
  var avg = averages();
  var names = parseTasks($('#tasks-input').value);
  var box = $('#task-hints'); box.innerHTML = '';
  var seen = {};
  names.forEach(function (raw) {
    var k = cleanName(raw).toLowerCase();
    if (seen[k] || !avg[k]) return;
    seen[k] = 1;
    var c = document.createElement('span');
    c.className = 'hint-chip';
    c.textContent = 'you usually need ~' + avg[k].avg + ' min for "' + avg[k].name + '"';
    box.appendChild(c);
  });
}

export function buildTasksFromInput() {
  var avg = averages();
  var raws = parseTasks($('#tasks-input').value);
  plan.tasks = raws.map(function (raw) {
    var hint = durationHint(raw);
    var name = cleanName(raw);
    var hinted = hint !== null, fromHistory = false;
    if (!hinted) {
      var a = avg[name.toLowerCase()];
      if (a) { hint = a.avg; hinted = true; fromHistory = true; }
    }
    return { id: uid(), name: name, alloc: hint || 0, hinted: hinted, fromHistory: fromHistory };
  });
}

export function allocate() {
  var pool = plan.budget;
  var fixed = 0, free = [];
  plan.tasks.forEach(function (t) {
    if (t.hinted && t.alloc > 0) fixed += t.alloc; else free.push(t);
  });
  var rest = Math.max(0, pool - fixed);
  if (free.length) {
    var per = Math.max(5, Math.round((rest / free.length) / 5) * 5);
    free.forEach(function (t) { t.alloc = per; });
  }
}

export function planTotal() {
  return plan.tasks.reduce(function (s, t) { return s + t.alloc; }, 0);
}

// ================================================================ SCHEDULE
export function buildBlocks() {
  var tech = currentTech();
  var blocks = [], focusCount = 0;
  plan.tasks.forEach(function (t, ti) {
    var left = t.alloc, part = 0, total = Math.max(1, Math.ceil(t.alloc / tech.focus));
    while (left > 0) {
      var len = Math.min(tech.focus, left);
      if (left - len > 0 && left - len < 5) len = left;
      left -= len; part++;
      blocks.push({ type: 'focus', taskId: t.id, name: t.name, min: len, part: part, parts: total });
      focusCount++;
      var lastOverall = (ti === plan.tasks.length - 1) && left <= 0;
      if (!lastOverall && tech.brk > 0) {
        var isLong = tech.longEvery && focusCount % tech.longEvery === 0;
        blocks.push({ type: 'break', name: isLong ? 'Long break' : 'Break', min: isLong ? tech.longBrk : tech.brk, long: !!isLong });
      }
    }
  });
  return blocks;
}

export function renderSchedule() {
  var ed = $('#task-editor'); ed.innerHTML = '';
  plan.tasks.forEach(function (t, i) {
    var row = document.createElement('div'); row.className = 'trow';
    var tech = currentTech();
    var parts = Math.max(1, Math.ceil(t.alloc / tech.focus));
    row.innerHTML =
      '<input class="tname" value="" aria-label="Task name">' +
      '<p class="tmeta">' + human(t.alloc) + ' · ' + parts + ' block' + (parts > 1 ? 's' : '') +
      (t.fromHistory ? ' · your usual pace' : '') + '</p>' +
      '<div class="tctl">' +
      '<button class="iconbtn" data-a="minus">&minus;5</button>' +
      '<button class="iconbtn" data-a="plus">+5</button>' +
      '<button class="iconbtn" data-a="up" aria-label="Move up">&uarr;</button>' +
      '<button class="iconbtn" data-a="down" aria-label="Move down">&darr;</button>' +
      '<button class="iconbtn del" data-a="del" aria-label="Delete task">Delete</button>' +
      '</div>';
    $('.tname', row).value = t.name;
    $('.tname', row).addEventListener('change', function (e) {
      t.name = e.target.value.trim() || t.name; renderSchedule();
    });
    $$('.iconbtn', row).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.a;
        if (a === 'plus') t.alloc += 5;
        if (a === 'minus') t.alloc = Math.max(5, t.alloc - 5);
        if (a === 'del') plan.tasks.splice(i, 1);
        if (a === 'up' && i > 0) plan.tasks.splice(i - 1, 0, plan.tasks.splice(i, 1)[0]);
        if (a === 'down' && i < plan.tasks.length - 1) plan.tasks.splice(i + 1, 0, plan.tasks.splice(i, 1)[0]);
        t.hinted = true;
        renderSchedule();
      });
    });
    ed.appendChild(row);
  });

  var used = planTotal(), tot = plan.budget;
  $('#budget-used').textContent = human(used) + ' planned';
  $('#budget-total').textContent = 'budget ' + human(tot);
  var pct = Math.min(100, Math.round(used / Math.max(1, tot) * 100));
  var fill = $('#budget-fill'); fill.style.width = pct + '%';
  fill.classList.toggle('over', used > tot);
  var w = $('#budget-warn');
  if (used > tot) {
    w.textContent = human(used - tot) + ' over your ' + human(tot) + ' budget. Trim a task or accept a longer day.';
    w.classList.remove('hidden'); w.classList.remove('info');
  } else if (tot - used >= 10) {
    w.textContent = human(tot - used) + ' of your budget is unassigned — add a task or give one more time.';
    w.classList.remove('hidden'); w.classList.add('info');
  } else w.classList.add('hidden');

  var blocks = buildBlocks(), tl = $('#timeline'); tl.innerHTML = '';
  if (!blocks.length) { tl.innerHTML = '<p class="empty">Add some tasks to see your timeline.</p>'; }
  var cursor = now(), fi = 0, fcount = blocks.filter(function (b) { return b.type === 'focus'; }).length;
  blocks.forEach(function (b) {
    var end = cursor + b.min * 60000;
    var row = document.createElement('div');
    row.className = 'tl-row' + (b.type === 'break' ? ' brk' : '');
    var label = b.type === 'focus'
      ? b.name + (b.parts > 1 ? ' (' + b.part + '/' + b.parts + ')' : '')
      : b.name;
    if (b.type === 'focus') fi++;
    row.innerHTML = '<div class="tl-main"><span class="tl-name"></span>' +
      '<span class="tl-len">' + b.min + 'm</span></div>' +
      '<div class="tl-time">' + clockOf(cursor) + ' – ' + clockOf(end) + '</div>';
    $('.tl-name', row).textContent = label;
    tl.appendChild(row);
    cursor = end;
  });
  if (blocks.length) {
    var f = document.createElement('p'); f.className = 'empty';
    f.textContent = fcount + ' focus blocks · finishes around ' + clockOf(cursor);
    tl.appendChild(f);
  }
  LS.set('draft', { plan: plan, tech: plan.tech });
}

// ================================================================ RECAP
export function finishDay() {
  var session = getSession();
  if (!session || session.finished) return;
  session.finished = true;
  stopTick();
  releaseWakeLock();
  session.done = session.done || {};
  var rec = {
    date: session.date, tasks: [], focus: 0, ext: 0,
    startHour: typeof session.startHour === 'number' ? session.startHour : new Date(session.startedAt || now()).getHours(),
    longest: Math.round((session.longestMs || 0) / 60000)
  };
  Object.keys(session.planned).forEach(function (id) {
    rec.tasks.push({
      name: session.names[id],
      planned: session.planned[id],
      actual: Math.round((session.actualMs[id] || 0) / 60000),
      ext: session.ext[id] || 0,
      done: !!session.done[id]
    });
    rec.focus += Math.round((session.actualMs[id] || 0) / 60000);
    rec.ext += session.ext[id] || 0;
  });
  var h = history(); h[rec.date] = rec; LS.set('history', h);
  LS.set('session', null);
  syncUp(); // sync to cloud after completing a day
  var gain = xpForDay(rec, streakOf(h, rec.date));
  var unlocks = checkUnlocks();
  renderRecap(rec, gain, unlocks);
  hideScanlines();
  show('recap');
  allDone();
  setTimeout(function () { burst(100); }, 300);
  var prevLevel = levelOf(totalXp(h) - gain.total);
  var curLevel = levelOf(totalXp(h));
  if (curLevel.level > prevLevel.level) {
    setTimeout(function () { levelUp(); levelUpFlash('Level ' + curLevel.level + '!'); }, 1200);
  }
  var c = dayCounts(rec);
  var line = 'That\'s the day. ' + human(rec.focus) + ' of focused work, ' + c.completed +
    ' of ' + c.planned + ' tasks done, plus ' + gain.total + ' XP.';
  if (unlocks.length) line += ' New badge: ' + unlocks[0].name + '.';
  speak(line, { interrupt: true });
}

function renderRecap(rec, gain, unlocks) {
  var h = history();
  gain = gain || xpForDay(rec, streakOf(h, rec.date));
  unlocks = unlocks || [];
  var c = dayCounts(rec);
  $('#r-focus').textContent = human(rec.focus);
  $('#r-ext').textContent = rec.ext;
  $('#r-tasks').textContent = c.completed + '/' + c.planned;

  var xp = totalXp(h), lv = levelOf(xp);
  $('#rx-gain').textContent = '+' + gain.total + ' XP today';
  $('#rx-level').textContent = 'Level ' + lv.level + ' · ' + lv.name;
  $('#rx-fill').style.width = lv.pct + '%';
  $('#rx-sub').textContent = lv.next
    ? xp + ' XP total · ' + lv.need + ' XP to ' + lv.next.name
    : xp + ' XP total · top tier reached';
  var ul = $('#rx-break'); ul.innerHTML = '';
  gain.parts.forEach(function (p) {
    var li = document.createElement('li');
    li.innerHTML = '<span></span><span>+' + p.xp + '</span>';
    $('span', li).textContent = p.label;
    ul.appendChild(li);
  });
  var toggleBtn = document.createElement('button');
  toggleBtn.className = 'xp-toggle';
  toggleBtn.textContent = 'Show breakdown';
  toggleBtn.addEventListener('click', function () {
    var open = ul.classList.toggle('open');
    this.textContent = open ? 'Hide breakdown' : 'Show breakdown';
  });
  var xpCard = $('#recap-xp');
  var existingToggle = xpCard.querySelector('.xp-toggle');
  if (existingToggle) existingToggle.remove();
  xpCard.appendChild(toggleBtn);

  var ub = $('#recap-unlocks'); ub.innerHTML = '';
  unlocks.forEach(function (b) {
    var el = document.createElement('div'); el.className = 'unlock';
    el.innerHTML = '<div class="uk">Badge unlocked</div><div class="un"></div><div class="ud"></div>';
    $('.un', el).textContent = b.name;
    $('.ud', el).textContent = b.crit;
    ub.appendChild(el);
  });
  var box = $('#recap-list'); box.innerHTML = '';
  rec.tasks.forEach(function (t) {
    var max = Math.max(1, t.planned, t.actual);
    var el = document.createElement('div'); el.className = 'rrow';
    el.innerHTML = '<div class="rn"></div>' +
      '<div class="rb"><span>planned ' + t.planned + 'm</span><span>actual ' + t.actual + 'm</span>' +
      '<span>+' + t.ext + 'm</span></div>' +
      '<div class="bar"><span class="plan" style="width:' + (t.planned / max * 100) + '%"></span>' +
      '<span class="act" style="width:' + (Math.min(t.actual, max) / max * 100) + '%"></span></div>';
    $('.rn', el).textContent = t.name;
    box.appendChild(el);
  });
  $('#recap-obs').textContent = observation(rec);
}

// ================================================================ PROGRESS
var _progTab = 'day';
function getProgTab() { return _progTab; }
export function setProgTab(v) { _progTab = v; }

var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" stroke-width="1.7"/></svg>';
var TICK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function hoursText(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return min + 'm';
  var h = Math.floor(min / 60), m = min % 60;
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

export function renderProgress() {
  $$('#prog-seg .seg-btn').forEach(function (b) {
    var on = b.dataset.tab === _progTab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  var body = $('#prog-body'); body.innerHTML = '';
  var h = history();
  if (_progTab === 'day') renderProgDay(body, h);
  else if (_progTab === 'week') renderProgWeek(body, h);
  else renderProgMonth(body, h);
}

export function renderRewards() {
  var h = history();
  renderBadgeGrid(h);
  renderRank(h);
}

function renderProgDay(body, h) {
  var iso = today(), rec = h[iso];
  if (!rec) {
    var prev = Object.keys(h).sort().reverse()[0];
    if (!prev) {
      body.appendChild(emptyEl('No days logged yet. Finish a day and it fills in — tasks, focused minutes, and your first badge.'));
      return;
    }
    iso = prev; rec = h[prev];
    body.appendChild(emptyEl('Nothing logged today yet — showing ' + prettyDate(iso) + '.'));
  }
  var c = dayCounts(rec);
  var s = sec(prettyDate(iso));
  s.appendChild(statRow([
    { v: c.completed + '/' + c.planned, l: 'tasks done' },
    { v: hoursText(c.focus), l: 'focused' },
    { v: String(c.ext), l: 'overruns' }
  ]));
  s.appendChild(statRow([
    { v: hoursText(c.longest), l: 'longest block' },
    { v: '+' + xpForDay(rec, streakOf(h, iso)).total, l: 'XP earned' },
    { v: String(streakOf(h, iso)), l: 'day streak' }
  ]));
  body.appendChild(s);
  var o = sec('Observation');
  o.appendChild(verdictEl(observation(rec)));
  body.appendChild(o);
}

function renderProgWeek(body, h) {
  var days = lastDays(7);
  var vals = days.map(function (d) { return dayCounts(h[d]).focus; });
  var tasks = days.reduce(function (a, d) { return a + dayCounts(h[d]).completed; }, 0);
  var focus = vals.reduce(function (a, b) { return a + b; }, 0);
  var active = days.filter(function (d) { return dayActive(h[d]); }).length;
  var s = sec('Last 7 days');
  s.appendChild(statRow([
    { v: hoursText(focus), l: 'focused' },
    { v: String(tasks), l: 'tasks done' },
    { v: active + '/7', l: 'days active' }
  ]));
  body.appendChild(s);

  var cs = sec('Focused minutes per day');
  var chart = document.createElement('div'); chart.className = 'chart';
  var max = Math.max.apply(null, vals.concat([1]));
  var bestI = focus > 0 ? vals.indexOf(Math.max.apply(null, vals)) : -1;
  var dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  if (focus === 0) {
    // fallback: empty state
    var bars = document.createElement('div'); bars.className = 'bars';
    days.forEach(function (d, i) {
      var col = document.createElement('div'); col.className = 'bcol';
      col.innerHTML = '<span class="bv"></span><span class="bb"></span>';
      bars.appendChild(col);
    });
    chart.appendChild(bars);
    var labels = document.createElement('div'); labels.className = 'blabels';
    days.forEach(function (d, i) {
      var sp = document.createElement('span');
      sp.textContent = dayLabels[dateOf(d).getDay()];
      labels.appendChild(sp);
    });
    chart.appendChild(labels);
    chart.appendChild(emptyEl('Nothing yet this week. Even one block lights up the chart.'));
  } else {
    // SVG wave graph
    var W = 320, H = 130, PAD_X = 20, PAD_Y = 18;
    var plotW = W - PAD_X * 2, plotH = H - PAD_Y * 2;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'wave-chart');

    // defs: gradient + glow filter
    var defs = document.createElementNS(ns, 'defs');
    var grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'wg-fill');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    var s1 = document.createElementNS(ns, 'stop');
    s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#D4FF00'); s1.setAttribute('stop-opacity', '.3');
    var s2 = document.createElementNS(ns, 'stop');
    s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#D4FF00'); s2.setAttribute('stop-opacity', '0');
    grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad);
    var filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id', 'wg-glow');
    var blur = document.createElementNS(ns, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '3'); blur.setAttribute('result', 'blur');
    filter.appendChild(blur);
    var merge = document.createElementNS(ns, 'feMerge');
    var mn1 = document.createElementNS(ns, 'feMergeNode'); mn1.setAttribute('in', 'blur');
    var mn2 = document.createElementNS(ns, 'feMergeNode'); mn2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(mn1); merge.appendChild(mn2); filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // compute points
    var pts = vals.map(function (v, i) {
      var x = PAD_X + (i / (vals.length - 1)) * plotW;
      var y = PAD_Y + plotH - (v / max) * plotH;
      return { x: x, y: y, v: v };
    });

    // build smooth cubic bezier path
    function smoothPath(points) {
      if (points.length < 2) return '';
      var d = 'M' + points[0].x + ',' + points[0].y;
      for (var i = 0; i < points.length - 1; i++) {
        var p0 = points[Math.max(0, i - 1)];
        var p1 = points[i];
        var p2 = points[i + 1];
        var p3 = points[Math.min(points.length - 1, i + 2)];
        var tension = 0.3;
        var cp1x = p1.x + (p2.x - p0.x) * tension;
        var cp1y = p1.y + (p2.y - p0.y) * tension;
        var cp2x = p2.x - (p3.x - p1.x) * tension;
        var cp2y = p2.y - (p3.y - p1.y) * tension;
        d += ' C' + cp1x + ',' + cp1y + ' ' + cp2x + ',' + cp2y + ' ' + p2.x + ',' + p2.y;
      }
      return d;
    }

    var linePath = smoothPath(pts);

    // filled area: close to bottom
    var areaPath = linePath + ' L' + pts[pts.length - 1].x + ',' + (PAD_Y + plotH) +
      ' L' + pts[0].x + ',' + (PAD_Y + plotH) + ' Z';

    var areaEl = document.createElementNS(ns, 'path');
    areaEl.setAttribute('d', areaPath);
    areaEl.setAttribute('fill', 'url(#wg-fill)');
    svg.appendChild(areaEl);

    var lineEl = document.createElementNS(ns, 'path');
    lineEl.setAttribute('d', linePath);
    lineEl.setAttribute('fill', 'none');
    lineEl.setAttribute('stroke', '#D4FF00');
    lineEl.setAttribute('stroke-width', '2.5');
    lineEl.setAttribute('stroke-linecap', 'round');
    lineEl.setAttribute('stroke-linejoin', 'round');
    lineEl.setAttribute('filter', 'url(#wg-glow)');
    svg.appendChild(lineEl);

    // dots
    pts.forEach(function (p, i) {
      if (p.v === 0) return;
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', p.x);
      c.setAttribute('cy', p.y);
      c.setAttribute('r', i === bestI ? '5' : '3.5');
      c.setAttribute('fill', i === bestI ? '#FF7A00' : '#D4FF00');
      c.setAttribute('filter', 'url(#wg-glow)');
      if (i === bestI) {
        c.setAttribute('class', 'wave-dot best');
      } else {
        c.setAttribute('class', 'wave-dot');
      }
      svg.appendChild(c);
      // value label
      var txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', p.x);
      txt.setAttribute('y', p.y - 10);
      txt.setAttribute('class', 'wave-val');
      txt.textContent = p.v;
      svg.appendChild(txt);
    });

    // day labels at bottom
    pts.forEach(function (p, i) {
      var txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', p.x);
      txt.setAttribute('y', PAD_Y + plotH + 16);
      txt.setAttribute('class', 'wave-label');
      txt.textContent = dayLabels[dateOf(days[i]).getDay()];
      svg.appendChild(txt);
    });

    chart.appendChild(svg);
  }
  cs.appendChild(chart);
  body.appendChild(cs);

  var prevDays = lastDays(7, shiftIso(today(), -7));
  var prevFocus = prevDays.reduce(function (a, d) { return a + dayCounts(h[d]).focus; }, 0);
  var v = sec('Verdict');
  if (focus === 0 && prevFocus === 0) {
    v.appendChild(verdictEl('Quiet stretch. A single 25-minute block gets things moving again.'));
  } else {
    var diff = focus - prevFocus;
    var line = 'You focused ' + hoursText(focus) + ' across ' + active + ' day' + (active === 1 ? '' : 's') + '.';
    if (prevFocus === 0) line += ' First tracked week — this is the bar to beat.';
    else if (diff > 4) line += ' Up ' + hoursText(diff) + ' on last week.';
    else if (diff < -4) line += ' Down ' + hoursText(-diff) + ' on last week — pull one more block in tomorrow.';
    else line += ' Level with last week. Steady counts.';
    if (bestI >= 0) line += ' Best day: ' + prettyDate(days[bestI]) + ', ' + hoursText(vals[bestI]) + '.';
    v.appendChild(verdictEl(line));
  }
  body.appendChild(v);
}

function renderProgMonth(body, h) {
  var nd = new Date(now()), y = nd.getFullYear(), m = nd.getMonth();
  var first = new Date(y, m, 1), dim = new Date(y, m + 1, 0).getDate();
  var focus = 0, tasks = 0, active = 0, vals = [];
  for (var i = 1; i <= dim; i++) {
    var iso = isoOf(new Date(y, m, i)), c = dayCounts(h[iso]);
    vals.push({ iso: iso, day: i, focus: c.focus });
    focus += c.focus; tasks += c.completed;
    if (c.completed > 0) active++;
  }
  var monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  var s = sec(monthName);
  s.appendChild(statRow([
    { v: hoursText(focus), l: 'focused' },
    { v: String(tasks), l: 'tasks done' },
    { v: String(active), l: 'active days' }
  ]));
  s.appendChild(statRow([
    { v: active ? hoursText(Math.round(focus / active)) : '—', l: 'avg / active day' },
    { v: String(streakOf(h)), l: 'current streak' },
    { v: '+' + monthXp(h, y, m), l: 'XP this month' }
  ]));
  body.appendChild(s);

  var cs = sec('Daily focus');
  var chart = document.createElement('div'); chart.className = 'chart';
  var grid = document.createElement('div'); grid.className = 'heat';
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (l) {
    var hd = document.createElement('div'); hd.className = 'hd'; hd.textContent = l; grid.appendChild(hd);
  });
  var lead = (first.getDay() + 6) % 7;
  for (var p = 0; p < lead; p++) {
    var pc = document.createElement('div'); pc.className = 'cell pad'; grid.appendChild(pc);
  }
  var maxF = vals.reduce(function (a, v) { return Math.max(a, v.focus); }, 0);
  vals.forEach(function (v) {
    var cell = document.createElement('div');
    var lvl = 0;
    if (v.focus > 0 && maxF > 0) {
      var r = v.focus / maxF;
      lvl = r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
    }
    cell.className = 'cell' + (lvl ? ' l' + lvl : '') + (v.iso === today() ? ' today' : '');
    cell.textContent = String(v.day);
    cell.title = prettyDate(v.iso) + ' · ' + hoursText(v.focus) + ' focused';
    grid.appendChild(cell);
  });
  chart.appendChild(grid);
  var lg = document.createElement('div'); lg.className = 'legend';
  lg.innerHTML = '<span>less</span><i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i><span>more</span>';
  var SW = ['#E8EAE3', 'rgba(184,227,75,.20)', 'rgba(184,227,75,.38)', 'rgba(184,227,75,.58)', '#B8E34B'];
  $$('i', lg).forEach(function (i) { i.style.background = SW[+i.dataset.l]; });
  chart.appendChild(lg);
  if (focus === 0) chart.appendChild(emptyEl('Nothing yet this month. Each day you finish fills in the grid.'));
  cs.appendChild(chart);
  body.appendChild(cs);

  var pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y;
  var pdim = new Date(py, pm + 1, 0).getDate(), pFocus = 0, pActive = 0;
  for (var j = 1; j <= pdim; j++) {
    var pIso = isoOf(new Date(py, pm, j)), pc2 = dayCounts(h[pIso]);
    pFocus += pc2.focus; if (pc2.completed > 0) pActive++;
  }
  var v2 = sec('Versus last month');
  var pName = new Date(py, pm, 1).toLocaleDateString(undefined, { month: 'long' });
  if (focus === 0 && pFocus === 0) {
    v2.appendChild(verdictEl('Fresh start. One completed day and the grid begins to fill.'));
  } else if (pFocus === 0) {
    v2.appendChild(verdictEl('Nothing logged in ' + pName + ', so ' + hoursText(focus) + ' across ' + active +
      ' day' + (active === 1 ? '' : 's') + ' this month is all upside.'));
  } else {
    var d = focus - pFocus;
    v2.appendChild(verdictEl(hoursText(focus) + ' this month against ' + hoursText(pFocus) + ' in ' + pName +
      ' — ' + (d >= 0 ? 'up ' + hoursText(d) : 'down ' + hoursText(-d)) + '. Active days: ' +
      active + ' vs ' + pActive + '.'));
  }
  body.appendChild(v2);
}

function monthXp(h, y, m) {
  var sum = 0;
  Object.keys(h).forEach(function (d) {
    var dt = dateOf(d);
    if (dt.getFullYear() === y && dt.getMonth() === m) sum += xpForDay(h[d], streakOf(h, d)).total;
  });
  return sum;
}

function renderBadgeGrid(h) {
  h = h || history();
  var have = earnedBadges(h), g = $('#badge-grid'); g.innerHTML = '';
  BADGES.forEach(function (b) {
    var on = have.indexOf(b.id) >= 0;
    var el = document.createElement('div');
    el.className = 'badge' + (on ? ' on' : '');
    el.innerHTML = '<span class="bi">' + (on ? TICK_SVG : LOCK_SVG) + '</span>' +
      '<span class="bt"><span class="bn"></span><span class="bc"></span></span>';
    $('.bn', el).textContent = b.name;
    $('.bc', el).textContent = b.crit;
    g.appendChild(el);
  });
}

function renderRank(h) {
  h = h || history();
  var st = localStanding(h), card = $('#rank-card');
  card.innerHTML = '<div class="rk">Your record</div><div class="rv"></div>' +
    '<div class="rd"></div><div class="rl">Compared to your own past — no leaderboards yet.</div>';
  if (!st) {
    $('.rv', card).textContent = 'Not ranked yet';
    $('.rd', card).textContent = 'Finish one day to start building a record.';
    return;
  }
  var lv = levelOf(st.xp);
  $('.rv', card).textContent = st.consistency + '% consistency';
  $('.rd', card).textContent = 'Active on ' + st.active + ' of the last ' + st.span + ' day' +
    (st.span === 1 ? '' : 's') + ' · ' + st.xp + ' XP · Level ' + lv.level + ' ' + lv.name +
    '. Compared to your own past — no leaderboards yet.';
}

export function renderLevelBadge() {
  var h = history(), xp = totalXp(h), lv = levelOf(xp), st = streakOf(h);
  var textEl = $('#lvl-badge-text');
  var streakEl = $('#lvl-badge-streak');
  if (textEl) textEl.textContent = 'Level ' + lv.level + ' \u00b7 ' + lv.name;
  if (streakEl) {
    if (streakAtRisk(h)) {
      streakEl.textContent = '\u26a0\ufe0f ' + st + ' day streak at risk';
    } else {
      streakEl.textContent = st === 0 ? 'no streak yet' : '\uD83D\uDD25 ' + st + ' day streak';
    }
  }
}

// ---- sign-in ----
export function account() { return LS.get('account', null); }

export function renderSignin() {
  var h = history(), xp = totalXp(h), st = streakOf(h);
  var box = $('#si-stats'); box.innerHTML = '';
  box.appendChild(statRow([
    { v: String(xp), l: 'XP' },
    { v: String(st), l: 'day streak' },
    { v: earnedBadges(h).length + '/' + BADGES.length, l: 'badges' }
  ]));
  $('#signin-err').classList.add('hidden');
  var a = account();
  $('#signin-email').value = (a && a.email) || '';
}

// ---- history ----
export function renderHistory() {
  var h = history(), dates = Object.keys(h).sort().reverse();
  var avg = averages(), keys = Object.keys(avg).sort(function (a, b) { return avg[b].n - avg[a].n; });
  var A = $('#hist-averages'); A.innerHTML = '';
  if (keys.length) {
    var g = document.createElement('div'); g.className = 'hgroup';
    g.innerHTML = '<h3>Your usual pace</h3>';
    keys.forEach(function (k) {
      var l = document.createElement('div'); l.className = 'hline';
      l.innerHTML = '<span></span><span>~' + avg[k].avg + ' min · ' + avg[k].n + 'x</span>';
      $('span', l).textContent = avg[k].name;
      g.appendChild(l);
    });
    A.appendChild(g);
  } else {
    A.innerHTML = '<p class="empty">Your history fills in after your first day.</p>';
  }
  var D = $('#hist-days'); D.innerHTML = '';
  dates.forEach(function (d) {
    var r = h[d], g = document.createElement('div'); g.className = 'hgroup';
    g.innerHTML = '<h3>' + prettyDate(d) + ' · ' + human(r.focus) + ' focused · +' + r.ext + 'm</h3>';
    (r.tasks || []).forEach(function (t) {
      var l = document.createElement('div'); l.className = 'hline';
      l.innerHTML = '<span></span><span>' + t.actual + 'm / ' + t.planned + 'm</span>';
      $('span', l).textContent = t.name;
      g.appendChild(l);
    });
    D.appendChild(g);
  });
}

// ---- late-binding for circular dep with session ----
setFinishDayFn(finishDay);
setBuildBlocksFn(buildBlocks);
setShowFn(show);

// ---- settings ----
export function renderSettings() {
  var muted = LS.get('muted', false);
  var toggle = $('#btn-settings-voice');
  if (toggle) toggle.setAttribute('aria-checked', muted ? 'false' : 'true');
  var a = account();
  var emailEl = $('#settings-account-email');
  var actionBtn = $('#btn-settings-account');
  if (a && a.email) {
    if (emailEl) emailEl.textContent = a.email;
    if (actionBtn) actionBtn.textContent = 'Manage';
  } else {
    if (emailEl) emailEl.textContent = 'Not signed in';
    if (actionBtn) actionBtn.textContent = 'Sign in';
  }
}
