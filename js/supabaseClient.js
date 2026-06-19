// Public browser Supabase client for DinoBoy Sticker Lab.
// Reads browser-visible config from js/appConfig.js.
// Never put the Supabase service role key in frontend code.

const appConfig = window.APP_CONFIG || {};

const hasSupabaseConfig = () => (
  appConfig.SUPABASE_URL !== "SUPABASE_URL"
  && appConfig.SUPABASE_ANON_KEY !== "SUPABASE_ANON_KEY"
  && Boolean(appConfig.SUPABASE_URL)
  && Boolean(appConfig.SUPABASE_ANON_KEY)
  && Boolean(window.supabase)
);

window.DinoBoySupabase = {
  isConfigured: hasSupabaseConfig,
  client: hasSupabaseConfig()
    ? window.supabase.createClient(appConfig.SUPABASE_URL, appConfig.SUPABASE_ANON_KEY)
    : null
};
