/* Dayman — Supabase auth: signup, login, logout, session. */

import { getClient, isConfigured } from './supabase.js';
import { LS } from './utils.js';

var _user = null;
var _listeners = [];

export { isConfigured };

export function currentUser() { return _user; }

export function onAuthChange(fn) { _listeners.push(fn); }

function notify() { _listeners.forEach(function (fn) { try { fn(_user); } catch (e) {} }); }

export async function initAuth() {
  var sb = getClient();
  if (!sb) return null;
  try {
    var res = await sb.auth.getSession();
    _user = res.data.session ? res.data.session.user : null;
  } catch (e) { _user = null; }
  sb.auth.onAuthStateChange(function (event, session) {
    _user = session ? session.user : null;
    LS.set('account', _user ? { email: _user.email, status: 'active', savedAt: Date.now() } : null);
    notify();
  });
  return _user;
}

export async function signUp(email, password) {
  var sb = getClient();
  if (!sb) return { error: 'Supabase not configured' };
  try {
    var res = await sb.auth.signUp({ email: email, password: password });
    if (res.error) return { error: res.error.message };
    _user = res.data.user;
    LS.set('account', { email: email, status: 'active', savedAt: Date.now() });
    notify();
    return { user: res.data.user };
  } catch (e) { return { error: e.message || 'Signup failed' }; }
}

export async function signIn(email, password) {
  var sb = getClient();
  if (!sb) return { error: 'Supabase not configured' };
  try {
    var res = await sb.auth.signInWithPassword({ email: email, password: password });
    if (res.error) return { error: res.error.message };
    _user = res.data.user;
    LS.set('account', { email: email, status: 'active', savedAt: Date.now() });
    notify();
    return { user: res.data.user };
  } catch (e) { return { error: e.message || 'Login failed' }; }
}

export async function signOut() {
  var sb = getClient();
  if (sb) {
    try { await sb.auth.signOut(); } catch (e) {}
  }
  _user = null;
  LS.set('account', null);
  notify();
}

export async function updateProfile(data) {
  var sb = getClient();
  if (!sb || !_user) return { error: 'Not signed in' };
  try {
    var res = await sb.auth.updateUser({ data: data });
    if (res.error) return { error: res.error.message };
    _user = res.data.user;
    notify();
    return { user: _user };
  } catch (e) { return { error: e.message || 'Update failed' }; }
}

export async function changePassword(newPw) {
  var sb = getClient();
  if (!sb || !_user) return { error: 'Not signed in' };
  try {
    var res = await sb.auth.updateUser({ password: newPw });
    if (res.error) return { error: res.error.message };
    return { ok: true };
  } catch (e) { return { error: e.message || 'Update failed' }; }
}

export async function deleteAccount() {
  var sb = getClient();
  if (!sb || !_user) return { error: 'Not signed in' };
  try {
    var uid = _user.id;
    await sb.from('user_data').delete().eq('user_id', uid);
    await sb.from('profiles').delete().eq('id', uid);
    await signOut();
    return { ok: true };
  } catch (e) { return { error: e.message || 'Delete failed' }; }
}
