/* Dayman — leaderboard: fetch weekly rankings from Edge Function. */

import { getClient, isConfigured } from './supabase.js';
import { currentUser } from './auth.js';

var _cache = null;
var _cacheTime = 0;
var CACHE_TTL = 60000; // 1 minute

export async function fetchLeaderboard(topN) {
  var sb = getClient();
  var user = currentUser();
  if (!sb || !user) return null;

  // Return cached data if fresh enough
  if (_cache && (Date.now() - _cacheTime) < CACHE_TTL) return _cache;

  try {
    var res = await sb.functions.invoke('weekly-leaderboard', {
      body: { action: 'leaderboard', userId: user.id, topN: topN || 10 }
    });
    if (res.error) return null;
    _cache = res.data;
    _cacheTime = Date.now();
    return _cache;
  } catch (e) { return null; }
}

export async function syncLeaderboard() {
  var sb = getClient();
  var user = currentUser();
  if (!sb || !user) return null;

  try {
    var res = await sb.functions.invoke('weekly-leaderboard', {
      body: { action: 'sync', userId: user.id }
    });
    if (res.error) return null;
    _cache = res.data;
    _cacheTime = Date.now();
    return _cache;
  } catch (e) { return null; }
}

export function clearLeaderboardCache() {
  _cache = null;
  _cacheTime = 0;
}
