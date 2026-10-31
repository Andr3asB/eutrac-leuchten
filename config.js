// Zugang zur Supabase-Datenbank für gemeinsame Merklisten.
// Beide Werte stehen im Supabase-Dashboard unter Project Settings → API.
// Der „anon public“-Schlüssel ist für die Veröffentlichung gedacht; die Datenbank lässt damit nur
// die Funktionen aus supabase/schema.sql zu, und die Listen selbst sind im Browser verschlüsselt.
// Leer lassen = nur lokale Merkliste (Sitzungs-Cookie).
window.MERKLISTE_CONFIG={
  supabaseUrl:"https://yvpnuitixodicbgfteei.supabase.co",
  supabaseAnonKey:"sb_publishable_j6oRu9iRtmiLAIni0XjfXg_SnTSR78L"
};
