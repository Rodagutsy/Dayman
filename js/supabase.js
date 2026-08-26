/* Dayman — Supabase client singleton. */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

var _sb = null;

export function isConfigured() {
  return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

export function getClient() {
  if (!_sb && isConfigured() && window.supabase) {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _sb;
}
