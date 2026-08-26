/* Dayman — entry point: wiring, resume, test hooks, service worker. */

import { $, $$, LS, now, today, setWarp, getWarp, toast, clearAppData } from './utils.js';
import { plan, getSession, setSession, history } from './state.js';
import { parseTasks, parseReply } from './parsing.js';
import { speak, unlockAudio, listen, speechLog, getMuted, setMuted } from './speech.js';
import { xpForDay, totalXp, levelOf, streakOf, earnedBadges, shiftIso } from './gamification.js';
import {
  startSession, saveSession, tick, curBlock, creditFocus, advance, prune,
  moreTimeNow, remaining, renderSession, decide, showDecision,
  cancelAuto, autoSecsLeft, blockEnded
} from './session.js';
import {
  show, refreshHints, buildTasksFromInput, allocate, renderSchedule,
  renderProgress, renderLevelBadge, renderSignin, account, renderHistory,
  renderRewards, renderSettings
} from './screens.js';
import { chime, tick as tickSfx, fanfare8bit, levelUp, breakStart, allDone } from './audio.js';
import { burst, xpFloat, levelUpFlash, showScanlines, hideScanlines } from './confetti.js';
import { runSplash } from './splash.js';
import { initAuth, signUp, signIn, signOut, currentUser, isConfigured, updateProfile, deleteAccount } from './auth.js';
import { syncUp, syncDown, exportData } from './sync.js';

// ---- plan init ----
var timeInteracted = false;

function getGreeting() {
  var h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatSliderTime(min) {
  var h = Math.floor(min / 60), m = min % 60;
  return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
}

function checkReveal() {
  var hasTasks = ($('#tasks-input').value || '').trim().length > 0;
  var revealTime = $('#reveal-time');
  var revealTech = $('#reveal-tech');
  var btn = $('#btn-map');
  if (revealTime) revealTime.classList.toggle('show', hasTasks);
  if (revealTech) revealTech.classList.toggle('show', hasTasks && timeInteracted);
  if (btn) {
    btn.classList.toggle('cta-ready', hasTasks);
    btn.classList.toggle('cta-dim', !hasTasks);
    if (hasTasks) btn.classList.add('pulse'); else btn.classList.remove('pulse');
  }
}

var TIME_PRESETS = [
  { label: '1 hr', min: 60 },
  { label: '2 hr', min: 120 },
  { label: '3 hr', min: 180 },
  { label: '4 hr', min: 240 },
  { label: '6 hr', min: 360 }
];

function initTimeChips() {
  var container = $('#time-chips');
  if (!container) return;
  container.innerHTML = '';
  TIME_PRESETS.forEach(function (p) {
    var chip = document.createElement('button');
    chip.className = 'time-chip' + (p.min === plan.budget ? ' is-on' : '');
    chip.textContent = p.label;
    chip.addEventListener('click', function () {
      selectTime(p.min);
      timeInteracted = true;
      checkReveal();
    });
    container.appendChild(chip);
  });
  var slider = $('#budget-slider');
  if (slider) {
    slider.value = plan.budget;
    updateTimeDisplay(plan.budget);
    slider.addEventListener('input', function () {
      var min = parseInt(this.value, 10);
      plan.budget = min;
      updateTimeDisplay(min);
      highlightTimeChip(min);
      saveDraft();
      timeInteracted = true;
      checkReveal();
    });
  }
}

function selectTime(min) {
  plan.budget = min;
  var slider = $('#budget-slider');
  if (slider) slider.value = min;
  updateTimeDisplay(min);
  highlightTimeChip(min);
  saveDraft();
}

function updateTimeDisplay(min) {
  var el = $('#time-display');
  if (el) el.textContent = formatSliderTime(min);
}

function highlightTimeChip(min) {
  var chips = $$('#time-chips .time-chip');
  chips.forEach(function (c, i) {
    c.classList.toggle('is-on', TIME_PRESETS[i] && TIME_PRESETS[i].min === min);
  });
}

function saveDraft() {
  LS.set('draft', { plan: { budget: plan.budget, tech: plan.tech }, tech: plan.tech });
}

// ---- technique list (flat cards) ----
var TECHS = [
  { id: 'pomodoro', name: 'Pomodoro', friendly: 'Quick sprints', icon: '\uD83D\uDFE2', desc: '25 min focus / 5 min break \u00b7 15 after 4' },
  { id: '5217', name: '52 / 17', friendly: 'Deep focus', icon: '\uD83D\uDFE0', desc: '52 min focus / 17 min break' },
  { id: 'deep', name: 'Deep Blocks', friendly: 'Steady blocks', icon: '\uD83D\uDD35', desc: '50 min focus / 10 min break' },
  { id: 'custom', name: 'Custom', friendly: 'Your own rhythm', icon: '\u2699\uFE0F', desc: 'Set your own focus and break' }
];

function initTechList() {
  var container = $('#tech-list');
  if (!container) return;
  container.innerHTML = '';
  TECHS.forEach(function (t, i) {
    var card = document.createElement('div');
    card.className = 'tech-card-item' + (t.id === plan.tech ? ' is-on' : '');
    card.dataset.tech = t.id;
    card.innerHTML =
      '<div class="tc-icon">' + t.icon + '</div>' +
      '<div class="tc-body">' +
        '<span class="tc-name">' + t.friendly + ' \u2014 ' + t.name + '</span>' +
        '<span class="tc-desc">' + t.desc + '</span>' +
      '</div>';
    card.addEventListener('click', function () { selectTech(t.id); });
    container.appendChild(card);
  });
}

function selectTech(id) {
  plan.tech = id;
  var cards = $$('#tech-list .tech-card-item');
  cards.forEach(function (c) { c.classList.toggle('is-on', c.dataset.tech === id); });
  $('#tech-custom').classList.toggle('hidden', plan.tech !== 'custom');
  saveDraft();
}

function initPlan() {
  var d = LS.get('draft', null);
  if (d && d.plan) {
    plan.budget = d.plan.budget || 180;
    plan.tech = d.plan.tech || d.tech || 'pomodoro';
  }
  $('#tasks-input').value = LS.get('lastInput', '');
  // greeting
  var greetEl = $('#greeting');
  if (greetEl) greetEl.textContent = getGreeting();
  // avatar + username
  var a = account();
  var profile = LS.get('profile', null);
  var displayName = (profile && profile.name) || (a && a.email ? a.email.split('@')[0] : 'You');
  displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  var avatarEl = $('#plan-avatar');
  var nameEl = $('#plan-username');
  if (nameEl) nameEl.textContent = displayName;
  if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
  // level badge
  renderLevelBadge();
  $('#lvl-badge').addEventListener('click', function () {
    this.classList.toggle('show-streak');
  });
  // time chips
  timeInteracted = false;
  initTimeChips();
  // tech list
  initTechList();
  $('#tech-custom').classList.toggle('hidden', plan.tech !== 'custom');
  refreshHints();
  checkReveal();
}

function goPlan() { show('plan'); refreshHints(); renderLevelBadge(); }
function skipSignin() { goPlan(); }

// ---- plan: mic (inline) ----
var planRec = null;

function showMicState(text, hide) {
  var el = $('#mic-state');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', hide || !text);
}

$('#btn-mic-plan').addEventListener('click', function () {
  unlockAudio();
  var btn = this;
  if (planRec) { try { planRec.stop(); } catch (e) {} planRec = null; btn.classList.remove('on'); showMicState('', true); return; }
  var base = $('#tasks-input').value;
  planRec = listen({
    continuous: true,
    onPartial: function (p) { var el = $('#mic-live'); el.textContent = p; el.classList.remove('hidden'); },
    onFinal: function (f) {
      base = (base ? base.replace(/[,\s]+$/, '') + ', ' : '') + f;
      $('#tasks-input').value = base;
      $('#mic-live').textContent = '';
      $('#mic-live').classList.add('hidden');
      refreshHints();
      checkReveal();
    },
    onState: function (s) {
      if (s === 'listening') { btn.classList.add('on'); showMicState('Listening\u2026', false); }
      else if (s === 'unavailable') { showMicState('Voice not supported', false); setTimeout(function () { showMicState('', true); }, 3000); }
      else if (s.indexOf('error') === 0) { showMicState('Mic problem', false); setTimeout(function () { showMicState('', true); }, 3000); btn.classList.remove('on'); planRec = null; }
      else if (s === 'ended') { btn.classList.remove('on'); planRec = null; showMicState('', true); }
    }
  });
  if (!planRec) btn.classList.remove('on');
});

$('#tasks-input').addEventListener('input', function () {
  LS.set('lastInput', this.value);
  clearTimeout(this._t); var self = this;
  this._t = setTimeout(function () { refreshHints(); checkReveal(); }, 350);
});

// ---- navigation ----
$('#btn-map').addEventListener('click', function () {
  unlockAudio();
  buildTasksFromInput();
  if (!plan.tasks.length) { toast('Add a task first'); $('#tasks-input').focus(); return; }
  allocate();
  renderSchedule();
  show('schedule');
});
$('#btn-back-plan').addEventListener('click', function () { goPlan(); });

// ---- wizard card collapse/expand ----
$('#reveal-time .label').addEventListener('click', function () {
  var card = $('#reveal-time');
  if (card.classList.contains('show')) card.classList.toggle('collapsed');
});
$('#reveal-tech .label').addEventListener('click', function () {
  var card = $('#reveal-tech');
  if (card.classList.contains('show')) card.classList.toggle('collapsed');
});
$('#btn-start').addEventListener('click', startSession);
$$('#prog-seg .seg-btn').forEach(function (b) {
  b.addEventListener('click', function () {
    var tab = b.dataset.tab;
    import('./screens.js').then(function (m) { m.setProgTab(tab); renderProgress(); });
    var bd = $('#screen-progress .body'); if (bd) bd.scrollTop = 0;
  });
});
$('#btn-full-history').addEventListener('click', function () { renderHistory(); show('history'); });
$('#btn-hist-back').addEventListener('click', function () { renderRewards(); show('rewards'); });

// ---- bottom nav ----
$('#bottom-nav').addEventListener('click', function (e) {
  var tab = e.target.closest('.nav-tab');
  if (!tab) return;
  var screen = tab.dataset.screen;
  unlockAudio();
  if (screen === 'plan') { goPlan(); }
  else if (screen === 'progress') { renderProgress(); show('progress'); }
  else if (screen === 'rewards') { renderRewards(); show('rewards'); }
  else if (screen === 'settings') { renderSettings(); show('settings'); }
});

// ---- settings ----
$('#btn-settings-voice').addEventListener('click', function () {
  var muted = LS.get('muted', false);
  LS.set('muted', !muted);
  this.setAttribute('aria-checked', muted ? 'true' : 'false');
  if (muted && window.speechSynthesis) speechSynthesis.cancel();
  toast(muted ? 'Voice coach on' : 'Voice coach off');
});
$('#btn-settings-account').addEventListener('click', function () {
  initProfile(); show('profile');
});
$('#btn-settings-clear').addEventListener('click', function () {
  if (!confirm('Clear all data? This removes your history, badges, and settings on this device.')) return;
  try { clearAppData(); } catch (e) {}
  toast('All data cleared');
  renderLevelBadge();
  goPlan();
});

// ---- session controls ----
$('#btn-pause').addEventListener('click', function () {
  var session = getSession();
  if (!session) return;
  if (session.paused) {
    session.endAt = now() + session.pausedRemain; session.paused = false;
    speak('Resuming.', { interrupt: true });
  } else {
    session.pausedRemain = Math.max(0, remaining()); session.paused = true;
    speak('Paused.', { interrupt: true });
  }
  renderSession();
  saveSession();
});
$('#btn-skip').addEventListener('click', function () {
  var session = getSession();
  if (!session) return;
  creditFocus();
  speak('Skipping ahead.', { interrupt: true });
  advance();
});
$('#btn-more').addEventListener('click', moreTimeNow);
$('#btn-done').addEventListener('click', function () {
  var session = getSession();
  if (!session) return;
  var b = curBlock();
  creditFocus();
  if (b.type === 'focus') {
    session.done = session.done || {};
    session.done[b.taskId] = true;
    session.blocks = session.blocks.filter(function (x, i) {
      return i <= session.idx || !(x.type === 'focus' && x.taskId === b.taskId);
    });
    prune();
    speak(b.name + ' done. Nice.', { interrupt: true });
  }
  advance();
});
$('#btn-mute').addEventListener('click', function () {
  var m = !getMuted(); setMuted(m);
  if (m && window.speechSynthesis) speechSynthesis.cancel();
  renderSession();
  toast(m ? 'Voice coach off' : 'Voice coach on');
});
$('#btn-quit').addEventListener('click', function () {
  var session = getSession();
  if (!session) { show('plan'); return; }
  creditFocus();
  import('./screens.js').then(function (m) { m.finishDay(); });
});

// ---- decision buttons ----
$$('#decision [data-dec]').forEach(function (b) {
  b.addEventListener('click', function () {
    var v = b.dataset.dec;
    decide(v === 'done' ? 'done' : 'extend', parseInt(v, 10));
  });
});
$('#dec-add').addEventListener('click', function () {
  var v = parseInt($('#dec-min').value, 10);
  if (!v || v < 1) { toast('Type a number'); return; }
  $('#dec-min').value = '';
  decide('extend', v);
});
$('#btn-dec-custom-toggle').addEventListener('click', function () {
  var dc = $('#dcustom');
  var open = dc.classList.toggle('show');
  this.textContent = open ? 'Fewer options' : 'More options';
});

// ---- decision mic ----
var decRecLocal = null;
$('#btn-mic-dec').addEventListener('click', function () {
  var btn = this;
  if (decRecLocal) { try { decRecLocal.stop(); } catch (e) {} decRecLocal = null; btn.classList.remove('on'); return; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  decRecLocal = listen({
    onPartial: function (p) { $('#dec-live').textContent = p; },
    onFinal: function (f) {
      $('#dec-live').textContent = f;
      var r = parseReply(f);
      if (!r) { $('#dec-live').textContent = '\u201c' + f + '\u201d \u2014 didn\u2019t catch that. Try \u201cdone\u201d or \u201cten more minutes\u201d.'; return; }
      if (r.kind === 'done') decide('done'); else decide('extend', r.min);
    },
    onState: function (s) {
      if (s === 'listening') { btn.classList.add('on'); $('#dec-live').textContent = 'Listening\u2026'; }
      else if (s === 'unavailable') { $('#dec-live').textContent = 'Voice not supported \u2014 use the buttons.'; }
      else if (s.indexOf('error') === 0) { $('#dec-live').textContent = 'Mic issue \u2014 use the buttons.'; btn.classList.remove('on'); decRecLocal = null; }
      else if (s === 'ended') { btn.classList.remove('on'); decRecLocal = null; }
    }
  });
});

// ---- recap ----
$('#btn-recap-home').addEventListener('click', function () { setSession(null); goPlan(); });
$('#btn-recap-done').addEventListener('click', function () {
  setSession(null);
  var a = account();
  if (!a && LS.get('signinAsked', '') !== today()) {
    LS.set('signinAsked', today());
    renderSignin(); show('signin');
    return;
  }
  goPlan();
});

// ---- sign-in ----
$('#btn-signin-skip').addEventListener('click', skipSignin);
$('#btn-signin-skip-top').addEventListener('click', skipSignin);
$('#btn-signin-go').addEventListener('click', function () {
  var v = ($('#signin-email').value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
    $('#signin-err').classList.remove('hidden');
    $('#signin-email').focus();
    return;
  }
  LS.set('account', { email: v, status: 'pending', savedAt: now() });
  toast('Saved on this device · sync pending');
  goPlan();
});
$('#signin-email').addEventListener('input', function () { $('#signin-err').classList.add('hidden'); });

// ---- onboarding ----
function finishOnboarding() {
  LS.set('onboarded', true);
  goPlan();
}

function initOnboarding() {
  var sb = isConfigured();
  if (!sb) {
    finishOnboarding();
    return;
  }
  // tab switching
  $$('.onb-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('.onb-tab').forEach(function (b) { b.classList.remove('is-on'); });
      t.classList.add('is-on');
      var tab = t.dataset.tab;
      $('#onb-form-signup').classList.toggle('hidden', tab !== 'signup');
      $('#onb-form-login').classList.toggle('hidden', tab !== 'login');
    });
  });
  // signup
  $('#onb-signup-go').addEventListener('click', async function () {
    var email = ($('#onb-signup-email').value || '').trim();
    var pw = $('#onb-signup-pw').value || '';
    var errEl = $('#onb-signup-err');
    errEl.classList.add('hidden');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errEl.textContent = 'Please enter a valid email.'; errEl.classList.remove('hidden'); return;
    }
    if (pw.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('hidden'); return;
    }
    this.disabled = true; this.textContent = 'Creating...';
    var res = await signUp(email, pw);
    this.disabled = false; this.textContent = 'Create account';
    if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }
    await syncUp();
    finishOnboarding();
  });
  // login
  $('#onb-login-go').addEventListener('click', async function () {
    var email = ($('#onb-login-email').value || '').trim();
    var pw = $('#onb-login-pw').value || '';
    var errEl = $('#onb-login-err');
    errEl.classList.add('hidden');
    if (!email || !pw) { errEl.textContent = 'Enter email and password.'; errEl.classList.remove('hidden'); return; }
    this.disabled = true; this.textContent = 'Logging in...';
    var res = await signIn(email, pw);
    this.disabled = false; this.textContent = 'Log in';
    if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }
    await syncDown();
    finishOnboarding();
  });
  // guest
  $('#onb-guest').addEventListener('click', function () { finishOnboarding(); });
  show('onboarding');
}

// ---- profile ----
function initProfile() {
  var u = currentUser();
  var a = account();
  var profile = LS.get('profile', null);
  var name = (profile && profile.name) || (a && a.email ? a.email.split('@')[0] : 'Guest');
  var initial = name.charAt(0).toUpperCase();
  $('#profile-avatar').textContent = initial;
  $('#profile-name').textContent = name;
  $('#profile-email').textContent = u ? u.email : (a ? a.email : 'Guest mode');
  $('#profile-email-desc').textContent = u ? u.email : 'No account linked';
  $('#profile-name-input').value = profile && profile.name ? profile.name : '';
  // save name
  $('#profile-name-input').addEventListener('change', async function () {
    var v = this.value.trim();
    if (!v) return;
    var p = LS.get('profile', {}); p.name = v; LS.set('profile', p);
    if (u) await updateProfile({ display_name: v });
    toast('Name updated');
    renderProfileDisplay();
  });
  // change email (placeholder)
  $('#btn-profile-change-email').addEventListener('click', function () {
    toast('Email change coming soon');
  });
  // change password
  $('#btn-profile-change-pw').addEventListener('click', function () {
    toast('Password change coming soon');
  });
  // export
  $('#btn-profile-export').addEventListener('click', function () {
    exportData();
    toast('Data exported');
  });
  // sign out
  $('#btn-profile-logout').addEventListener('click', async function () {
    if (!confirm('Sign out? Your data stays on this device.')) return;
    await syncUp();
    await signOut();
    toast('Signed out');
    renderSettings();
    goPlan();
  });
  // delete
  $('#btn-profile-delete').addEventListener('click', async function () {
    if (!confirm('Delete your account and all server data? This cannot be undone.')) return;
    if (!confirm('Really delete everything?')) return;
    var res = await deleteAccount();
    if (res.error) { toast('Delete failed: ' + res.error); return; }
    clearAppData();
    toast('Server data deleted. Email account remains — contact support to fully remove.');
    goPlan();
  });
}

function renderProfileDisplay() {
  var u = currentUser();
  var a = account();
  var profile = LS.get('profile', null);
  var name = (profile && profile.name) || (a && a.email ? a.email.split('@')[0] : 'Guest');
  $('#profile-avatar').textContent = name.charAt(0).toUpperCase();
  $('#profile-name').textContent = name;
  if ($('#profile-name-input')) $('#profile-name-input').value = profile && profile.name ? profile.name : '';
}

$('#btn-profile-back').addEventListener('click', function () { renderSettings(); show('settings'); });

// ---- any interaction cancels auto-advance ----
['pointerdown', 'keydown'].forEach(function (ev) {
  document.addEventListener(ev, function () {
    var session = getSession();
    if (session && session.awaiting && session.autoUntil) cancelAuto('auto-advance cancelled — your call');
  }, true);
});

// ---- resume interrupted session ----
(function resume() {
  var s = LS.get('session', null);
  if (!s || !s.blocks || !s.blocks.length || s.finished ||
      s.date !== today() || s.idx >= s.blocks.length) { LS.set('session', null); return; }
  setSession(s);
  show('session');
  renderSession();
  startTick(tick);
  var r = remaining();
  if (r <= 0 && !s.awaiting) blockEnded();
  else if (s.awaiting) { showDecision(); }
  speak('Picking up where you left off.', { interrupt: true });
})();

// ---- splash → boot ----
(function bootApp() {
  var hasSession = !!getSession();
  var onboarded = LS.get('onboarded', false);

  async function afterSplash() {
    initPlan();
    await initAuth().catch(function () {});
    if (!onboarded) {
      initOnboarding();
    } else {
      if (currentUser()) { await syncDown().catch(function () {}); }
      show('plan');
    }
  }

  if (hasSession) {
    var splashEl = document.getElementById('splash');
    if (splashEl) splashEl.style.display = 'none';
    initPlan();
  } else {
    runSplash(function () {
      afterSplash();
    });
  }
})();

// ---- service worker ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    // clear stale caches from old builds
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== 'dayman-v1'; }).map(function (k) { return caches.delete(k); }));
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      if (reg.waiting) reg.waiting.postMessage('skip');
    }).catch(function () {});
  });
}

// ---- test hooks (only when ?test=1) ----
if (/(?:\?|&)test=1/.test(location.search)) {
window.__ds = {
  speechLog: speechLog,
  warp: function (ms) { setWarp(ms); tick(); return getWarp(); },
  state: function () {
    var session = getSession();
    return {
      screen: document.body.dataset.screen,
      idx: session && session.idx,
      blocks: session && session.blocks.map(function (b) { return b.type + ':' + b.name + ':' + b.min; }),
      remaining: session ? Math.round(remaining() / 1000) : null,
      awaiting: session && session.awaiting,
      actualMs: session && session.actualMs,
      ext: session && session.ext,
      countdown: $('#countdown').textContent
    };
  },
  plan: function () { return plan; },
  parseTasks: parseTasks,
  parseReply: parseReply,
  autoSecs: autoSecsLeft,
  xpForDay: xpForDay,
  totalXp: function () { return totalXp(); },
  level: function () { return levelOf(totalXp()); },
  streak: function () { return streakOf(); },
  badges: function () { return earnedBadges(); },
  history: history,
  account: account,
  refresh: function () { renderLevelBadge(); },
  seedDemo: function () {
    var h = history();
    var recipe = [
      [1, [['design a flyer', 30, 35, 1, true], ['fix the booking form', 45, 45, 0, true], ['write the newsletter', 25, 20, 0, false]], 9],
      [2, [['design and develop the hero section', 50, 55, 1, true], ['client call notes', 25, 25, 0, true]], 8],
      [3, [['edit the promo video', 50, 50, 0, true], ['invoices', 25, 25, 0, true], ['inbox zero', 25, 15, 0, true]], 7],
      [4, [['landing page copy', 50, 40, 0, true]], 10],
      [6, [['brand moodboard', 50, 60, 2, true], ['pitch deck', 50, 45, 0, true]], 9],
      [7, [['fix the booking form', 45, 50, 1, true]], 11],
      [9, [['design a flyer', 30, 30, 0, true], ['newsletter', 25, 25, 0, true]], 8],
      [12, [['photo edits', 50, 45, 0, true]], 13],
      [16, [['site audit', 50, 55, 1, true], ['seo fixes', 25, 25, 0, true]], 9]
    ];
    recipe.forEach(function (r) {
      var iso = shiftIso(today(), -r[0]);
      var tasks = r[1].map(function (t) {
        return { name: t[0], planned: t[1], actual: t[2], ext: t[3], done: t[4] };
      });
      h[iso] = {
        date: iso, tasks: tasks, seed: true, startHour: r[2],
        focus: tasks.reduce(function (a, t) { return a + t.actual; }, 0),
        ext: tasks.reduce(function (a, t) { return a + t.ext; }, 0),
        longest: tasks.reduce(function (a, t) { return Math.max(a, t.actual); }, 0)
      };
    });
    LS.set('history', h);
    LS.set('badges', earnedBadges(h));
    renderLevelBadge();
    return Object.keys(h).length;
  },
  clearSeed: function () {
    var h = history();
    Object.keys(h).forEach(function (d) { if (h[d] && h[d].seed) delete h[d]; });
    LS.set('history', h);
    renderLevelBadge();
    return Object.keys(h).length;
  },
  reset: function () { try { clearAppData(); } catch (e) {} }
};
}
