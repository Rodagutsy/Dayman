/* Dayman — display identity: the single source of truth for the user's name.
   Guests are "Guest". A new account gets a generated "User ####" name that the
   user can rename from Settings/Profile, and the rename propagates everywhere. */

import { LS } from './utils.js';
import { currentUser, updateProfile } from './auth.js';
import { getClient } from './supabase.js';

export var GUEST_NAME = 'Guest';

var _name = null;
var _listeners = [];

function notify() { _listeners.forEach(function (fn) { try { fn(_name); } catch (e) {} }); }

function generateName() {
  // distinct 4 digit number
  return 'User ' + (1000 + Math.floor(Math.random() * 9000));
}

function storedName() {
  var p = LS.get('profile', null);
  return (p && p.name) ? String(p.name) : null;
}

// Best effort mirror to Supabase so the leaderboard shows the same name.
function pushToServer(name) {
  var u = currentUser();
  if (!u || !name) return;
  try {
    var sb = getClient();
    if (sb) {
      var q = sb.from('profiles').upsert({ id: u.id, display_name: name });
      if (q && q.then) q.then(function () {}).catch(function () {});
    }
  } catch (e) {}
  try { updateProfile({ display_name: name }); } catch (e) {}
}

/* Give every signed-in user a name, and guests "Guest". Call after initAuth. */
export async function ensureIdentity() {
  var u = currentUser();
  if (!u) {
    _name = storedName() || GUEST_NAME;
    return _name;
  }
  var p = LS.get('profile', null) || {};
  if (!p.name) {
    p.name = generateName();
    LS.set('profile', p);
  }
  _name = p.name;
  pushToServer(_name);
  return _name;
}

export function displayName() {
  if (_name) return _name;
  var u = currentUser();
  _name = storedName() || (u ? generateName() : GUEST_NAME);
  return _name;
}

export function avatarInitial() {
  var n = displayName();
  return (n || GUEST_NAME).charAt(0).toUpperCase();
}

export function setDisplayName(name) {
  var v = String(name || '').trim().slice(0, 40);
  if (!v) return false;
  var p = LS.get('profile', null) || {};
  p.name = v;
  LS.set('profile', p);
  _name = v;
  pushToServer(v);
  notify();
  return true;
}

export function onIdentityChange(fn) { _listeners.push(fn); }

// Called on sign-out / cleared data so the next read starts from scratch.
export function resetIdentity() {
  _name = null;
  notify();
}
