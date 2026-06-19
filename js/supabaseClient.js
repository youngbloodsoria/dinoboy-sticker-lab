// Public browser Supabase client for DinoBoy Sticker Lab.
// Reads browser-visible config from js/appConfig.js.
// Never put the Supabase service role key in frontend code.

const appConfig = window.APP_CONFIG || {};

const hasSupabaseConfig = () => (
  appConfig.SUPABASE_URL !== "https://icrqmvkjfnwkbipjhhlw.supabase.co"
  && appConfig.SUPABASE_ANON_KEY !== "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcnFtdmtqZm53a2JpcGpoaGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzU3OTksImV4cCI6MjA5NzQxMTc5OX0.SwLDNfSLMxTVtHm3sN5vVTdVUrqxBZ4-AUzCcjDaDhU"
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
