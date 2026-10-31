-- Gemeinsame, Ende-zu-Ende-verschlüsselte Merklisten für „Leuchten für EUTRAC“.
-- Einmalig im Supabase-Dashboard unter „SQL Editor“ ausführen.
--
-- Die Datenbank sieht nur Chiffretext. Schlüssel und Passwort verlassen den Browser nie.
-- Zugriff ausschließlich über die drei Funktionen unten; die Tabelle selbst ist für anon gesperrt.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.merklisten (
  id          uuid primary key,
  salt        text not null check (length(salt) between 16 and 64),
  has_pw      boolean not null default false,
  ct          text not null check (length(ct) <= 200000),
  version     integer not null default 1,
  write_hash  text not null check (length(write_hash) = 64),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.merklisten enable row level security;
revoke all on table public.merklisten from anon, authenticated;

-- Neue Liste anlegen. Gibt die Version (1) zurück.
create or replace function public.merkliste_create(p_id uuid, p_salt text, p_has_pw boolean, p_ct text, p_write_hash text)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
begin
  insert into merklisten (id, salt, has_pw, ct, write_hash) values (p_id, p_salt, p_has_pw, p_ct, p_write_hash);
  return 1;
end $$;

-- Liste lesen (nur mit bekannter ID; Inhalt ist verschlüsselt).
create or replace function public.merkliste_get(p_id uuid)
returns table (salt text, has_pw boolean, ct text, version integer)
language sql stable security definer set search_path = public, extensions
as $$
  select m.salt, m.has_pw, m.ct, m.version from merklisten m where m.id = p_id;
$$;

-- Liste schreiben. Nur mit gültigem Schreib-Token (aus Link-Schlüssel + Passwort abgeleitet).
-- Rückgabe: neue Version, oder -1 wenn inzwischen jemand anderes gespeichert hat (dann neu laden und erneut versuchen).
create or replace function public.merkliste_update(p_id uuid, p_write_token text, p_ct text, p_expected integer)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v integer;
  h text := encode(digest(p_write_token, 'sha256'), 'hex');
begin
  if not exists (select 1 from merklisten where id = p_id and write_hash = h) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update merklisten set ct = p_ct, version = version + 1, updated_at = now()
   where id = p_id and version = p_expected
   returning version into v;
  return coalesce(v, -1);
end $$;

-- Liste endgültig löschen (ebenfalls nur mit Schreib-Token).
create or replace function public.merkliste_delete(p_id uuid, p_write_token text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
begin
  delete from merklisten where id = p_id and write_hash = encode(digest(p_write_token, 'sha256'), 'hex');
  return found;
end $$;

revoke all on function public.merkliste_create(uuid, text, boolean, text, text) from public;
revoke all on function public.merkliste_get(uuid) from public;
revoke all on function public.merkliste_update(uuid, text, text, integer) from public;
revoke all on function public.merkliste_delete(uuid, text) from public;
grant execute on function public.merkliste_create(uuid, text, boolean, text, text) to anon, authenticated;
grant execute on function public.merkliste_get(uuid) to anon, authenticated;
grant execute on function public.merkliste_update(uuid, text, text, integer) to anon, authenticated;
grant execute on function public.merkliste_delete(uuid, text) to anon, authenticated;
