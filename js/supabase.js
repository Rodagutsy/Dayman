/* Dayman — Supabase client singleton. */

/* Config comes from window.__SUPABASE_CONFIG, defined by js/supabase-config.js
   (loaded as a plain script in index.html). That file is gitignored, so on the
   deployed site it may be absent — in which case the app runs fully offline in
   guest mode rather than crashing on a missing module import. */

var _sb = null;

export function isConfigured() {
  var cfg = window.__SUPABASE_CONFIG || {};
  return !!(cfg.url && cfg.anonKey &&
    cfg.url !== 'YOUR_SUPABASE_URL' && cfg.url.indexOf('YOUR_') !== 0 &&
    cfg.anonKey.indexOf('YOUR_') !== 0);
}

export function getClient() {
  if (!_sb && isConfigured() && window.supabase) {
    var cfg = window.__SUPABASE_CONFIG;
    _sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  }
  return _sb;
}
