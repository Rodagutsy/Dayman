/* Dayman — data sync: upload/download all local data to Supabase. */

import { getClient, isConfigured } from './supabase.js';
import { LS } from './utils.js';
import { currentUser } from './auth.js';

var _syncing = false;
var _lastSync = null;
export function isSyncing() { return _syncing; }
export function lastSync() { return _lastSync; }

function collectLocalData() {
  return {
    history: LS.get('history', {}),
    badges: LS.get('badges', []),
    muted: LS.get('muted', false),
    lastInput: LS.get('lastInput', ''),
    draft: LS.get('draft', null),
    profile: LS.get('profile', null)
  };
}

function applyRemoteData(data) {
  if (!data) return;
  if (data.history) LS.set('history', data.history);
  if (data.badges) LS.set('badges', data.badges);
  if (typeof data.muted === 'boolean') LS.set('muted', data.muted);
  if (data.lastInput) LS.set('lastInput', data.lastInput);
  if (data.draft) LS.set('draft', data.draft);
  if (data.profile) LS.set('profile', data.profile);
}

export async function syncUp() {
  var sb = getClient();
  if (!sb || !currentUser()) return;
  _syncing = true;
  try {
    var uid = currentUser().id;
    var data = collectLocalData();
    var existing = await sb.from('user_data').select('id').eq('user_id', uid).maybeSingle();
    if (existing.data) {
      await sb.from('user_data').update({ data: data, updated_at: new Date().toISOString() }).eq('user_id', uid);
    } else {
      await sb.from('user_data').insert({ user_id: uid, data: data });
    }
    _lastSync = Date.now();
  } catch (e) { /* silent */ }
  _syncing = false;
}

export async function syncDown() {
  var sb = getClient();
  if (!sb || !currentUser()) return;
  _syncing = true;
  try {
    var uid = currentUser().id;
    var res = await sb.from('user_data').select('data').eq('user_id', uid).maybeSingle();
    if (res.data && res.data.data) {
      applyRemoteData(res.data.data);
      _lastSync = Date.now();
    }
  } catch (e) { /* silent */ }
  _syncing = false;
}

export function exportData() {
  var data = collectLocalData();
  data.exportedAt = new Date().toISOString();
  data.version = '1.0';
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'dayman-data-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}
