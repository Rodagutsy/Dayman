/* Dayman — Supabase configuration. Sets window.__SUPABASE_CONFIG.
   The anon key + URL are PUBLIC by design (protected by RLS on the servers),
   so this file is committed and deployed with the site. Load it as a plain
   script in index.html BEFORE js/app.js:
       <script src="js/supabase-config.js"></script> */

window.__SUPABASE_CONFIG = {
  url: 'https://lhxnoljopinkshtwqdws.supabase.co',
  anonKey: 'sb_publishable_SPU7PHwuMsuCzKZhf5QjpA_fasOV0vp'
};
