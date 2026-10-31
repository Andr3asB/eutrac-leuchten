// Zugang zur Supabase-Datenbank für gemeinsame Merklisten.
// Beide Werte stehen im Supabase-Dashboard unter Project Settings → API.
// Der „anon public“-Schlüssel ist für die Veröffentlichung gedacht; die Datenbank lässt damit nur
// die Funktionen aus supabase/schema.sql zu, und die Listen selbst sind im Browser verschlüsselt.
// Leer lassen = nur lokale Merkliste (Sitzungs-Cookie).
window.MERKLISTE_CONFIG={
  supabaseUrl:"",
  supabaseAnonKey:""
};
