/* Dayman — Supabase auth: signup, login, logout, session. */

import { getClient, isConfigured } from './supabase.js';
import { LS } from './utils.js';

var _user = null;
var _listeners = [];
var _watching = false;

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
  if (!_watching) {
    _watching = true;
    sb.auth.onAuthStateChange(function (event, session) {
      _user = session ? session.user : null;
      LS.set('account', _user ? { email: _user.email, status: 'active', savedAt: Date.now() } : null);
      notify();
    });
  }
  return _user;
}

// Re-read the session after the user clicks their confirmation link.
export async function refreshSession() {
  var sb = getClient();
  if (!sb) return null;
  try {
    var res = await sb.auth.getSession();
    _user = res.data.session ? res.data.session.user : null;
  } catch (e) { _user = null; }
  if (_user) {
    LS.set('account', { email: _user.email, status: 'active', savedAt: Date.now() });
  }
  notify();
  return _user;
}

/* Password signup. When the project requires email confirmation Supabase
   returns no session, so we report needsConfirm and let the UI ask the user to
   check their inbox. A brand-new account is the only path to a congratulations
   page — Supabase returns an identity-less user for an email that exists. */
export async function signUp(email, password) {
  var sb = getClient();
  if (!sb) return { error: 'Supabase not configured' };
  try {
    var res = await sb.auth.signUp({ email: email, password: password });
    if (res.error) return { error: res.error.message };
    var user = res.data.user || null;
    if (res.data.session) {
      _user = user;
      LS.set('account', { email: email, status: 'active', savedAt: Date.now() });
      notify();
      return { user: user, needsConfirm: false };
    }
    var identities = (user && user.identities) || [];
    if (!identities.length) return { error: 'That email already has an account. Log in instead.' };
    return { user: user, needsConfirm: true, email: email };
  } catch (e) { return { error: e.message || 'Signup failed' }; }
}

export async function resendConfirmation(email) {
  var sb = getClient();
  if (!sb) return { error: 'Supabase not configured' };
  try {
    var res = await sb.auth.resend({ type: 'signup', email: email });
    if (res.error) return { error: res.error.message };
    return { ok: true };
  } catch (e) { return { error: e.message || 'Could not resend the email' }; }
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

/* Password change. Supabase needs a fresh session for credential updates, so the
   current password is verified first. */
export async function changePassword(currentPw, newPw) {
  var sb = getClient();
  if (!sb || !_user) return { error: 'Not signed in' };
  if (!newPw || String(newPw).length < 6) return { error: 'New password must be at least 6 characters.' };
  try {
    if (currentPw) {
      var re = await sb.auth.signInWithPassword({ email: _user.email, password: currentPw });
      if (re.error) return { error: 'That current password is not right.' };
      _user = re.data.user || _user;
    }
    var res = await sb.auth.updateUser({ password: newPw });
    if (res.error) return { error: res.error.message };
    _user = res.data.user || _user;
    notify();
    return { ok: true };
  } catch (e) { return { error: e.message || 'Password update failed' }; }
}

export async function deleteAccount() {
  var sb = getClient();
  if (!sb || !_user) return { error: 'Not signed in' };
  try {
    var uid = _user.id;
    // Delete server-side data (RLS policies allow this)
    await sb.from('user_data').delete().eq('user_id', uid);
    await sb.from('profiles').delete().eq('id', uid);
    // Note: auth.users deletion requires a server-side Edge Function.
    // The auth account (email + password hash) remains until a server endpoint removes it.
    await signOut();
    return { ok: true, note: 'Server data deleted. Email account remains — contact support to fully delete.' };
  } catch (e) { return { error: e.message || 'Delete failed' }; }
}
