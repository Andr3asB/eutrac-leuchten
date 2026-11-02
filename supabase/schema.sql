-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Andreas Bosch – Lichtplaner für EUTRAC
-- Gemeinsame, Ende-zu-Ende-verschlüsselte Merklisten für den „Lichtplaner für EUTRAC“.
-- Im Supabase-Dashboard unter „SQL Editor“ ausführen. Das Skript kann gefahrlos erneut ausgeführt werden;
-- bestehende Listen bleiben erhalten (Stand 11/2026: Begrenzungen gegen Missbrauch, automatisches Aufräumen).
--
-- Die Datenbank sieht nur Chiffretext. Schlüssel und Passwort verlassen den Browser nie.
-- Zugriff ausschließlich über die vier Funktionen unten; die Tabellen selbst sind für anon gesperrt.
--
-- Schutz vor Missbrauch:
--  • Größe je Liste höchstens 100 000 Zeichen Chiffretext (reale Listen: wenige KB)
--  • Anlegen: höchstens 10 Listen je Absender und Stunde, 300 insgesamt je Stunde, höchstens 20 000 Listen
--    (Absender = gekürzter, täglich neu gesalzener Hash der IP-Adresse, wird nach 24 Stunden gelöscht)
--  • Listen, die 18 Monate weder geöffnet noch geändert wurden, werden automatisch gelöscht

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.merklisten (
  id          uuid primary key,
  salt        text not null check (length(salt) between 16 and 64),
  has_pw      boolean not null default false,
  ct          text not null,
  version     integer not null default 1,
  write_hash  text not null check (length(write_hash) = 64),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.merklisten add column if not exists accessed_at timestamptz not null default now();
-- Größengrenze (ersetzt die frühere Grenze von 200 000 Zeichen)
alter table public.merklisten drop constraint if exists merklisten_ct_check;
alter table public.merklisten drop constraint if exists merklisten_ct_len;
alter table public.merklisten add constraint merklisten_ct_len check (length(ct) <= 100000) not valid;
create index if not exists merklisten_seen_idx on public.merklisten (greatest(updated_at, accessed_at));

alter table public.merklisten enable row level security;
revoke all on table public.merklisten from anon, authenticated;

-- Zähler für die Begrenzung beim Anlegen (nur gehashte, gekürzte Absenderkennung, höchstens 24 Stunden)
create table if not exists public.merkliste_rl (
  bucket text not null,
  t      timestamptz not null default now()
);
create index if not exists merkliste_rl_idx on public.merkliste_rl (bucket, t);
alter table public.merkliste_rl enable row level security;
revoke all on table public.merkliste_rl from anon, authenticated;

-- Geheimer Salt für den IP-Hash (einmalig zufällig erzeugt, verlässt die Datenbank nie)
create table if not exists public.merkliste_secret (s text not null);
alter table public.merkliste_secret enable row level security;
revoke all on table public.merkliste_secret from anon, authenticated;
insert into public.merkliste_secret (s) select encode(extensions.gen_random_bytes(32), 'hex')
 where not exists (select 1 from public.merkliste_secret);

-- Neue Liste anlegen. Gibt die Version (1) zurück.
create or replace function public.merkliste_create(p_id uuid, p_salt text, p_has_pw boolean, p_ct text, p_write_hash text)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  ip text := coalesce(nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), ''), 'unbekannt');
  h  text;
begin
  if length(p_ct) > 100000 then raise exception 'too_large' using errcode = '22001'; end if;
  -- Aufräumen: alte Zähler, und Listen, die 18 Monate weder geöffnet noch geändert wurden
  delete from merkliste_rl where t < now() - interval '1 day';
  delete from merklisten where greatest(updated_at, accessed_at) < now() - interval '18 months';
  h := 'ip:' || left(encode(digest(ip || current_date::text || (select s from merkliste_secret limit 1), 'sha256'), 'hex'), 16);
  if (select count(*) from merkliste_rl where bucket = h and t > now() - interval '1 hour') >= 10
     or (select count(*) from merkliste_rl where bucket = 'all' and t > now() - interval '1 hour') >= 300 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from merklisten) >= 20000 then
    raise exception 'storage_full' using errcode = 'P0001';
  end if;
  insert into merkliste_rl (bucket) values (h), ('all');
  insert into merklisten (id, salt, has_pw, ct, write_hash) values (p_id, p_salt, p_has_pw, p_ct, p_write_hash);
  return 1;
end $$;

-- Liste lesen (nur mit bekannter ID; Inhalt ist verschlüsselt). Merkt sich höchstens einmal am Tag den letzten Abruf,
-- damit genutzte, aber selten geänderte Listen nicht aufgeräumt werden.
drop function if exists public.merkliste_get(uuid);
create or replace function public.merkliste_get(p_id uuid)
returns table (salt text, has_pw boolean, ct text, version integer)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update merklisten set accessed_at = now() where id = p_id and accessed_at < now() - interval '1 day';
  return query select m.salt, m.has_pw, m.ct, m.version from merklisten m where m.id = p_id;
end $$;

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
  if length(p_ct) > 100000 then raise exception 'too_large' using errcode = '22001'; end if;
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
