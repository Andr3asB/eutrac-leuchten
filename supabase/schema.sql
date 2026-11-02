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
--  • Größe je Liste höchstens 64 000 Zeichen Chiffretext (reale Listen: wenige KB)
--  • Gesamtspeicher aller Listen höchstens 300 MB (der kostenlose Supabase-Tarif hat 500 MB)
--  • Anlegen: höchstens 10 Listen je Absender und Stunde und 30 je Tag. Keine Gesamtgrenze pro Stunde,
--    damit ein Einzelner das Anlegen nicht für alle sperren kann.
--    Absender = gekürzter, täglich neu gesalzener Hash der IP-Adresse, wird nach 24 Stunden gelöscht.
--    Die IP stammt aus Headern, die der Aufrufer nicht selbst setzen kann: cf-connecting-ip (Cloudflare vor
--    Supabase), sonst x-real-ip, sonst der LETZTE Eintrag von x-forwarded-for (Proxys hängen hinten an;
--    den ersten Eintrag kann der Aufrufer frei wählen).
--  • Aufräumen: Listen, die nach dem Anlegen nie geändert und nie wieder geöffnet wurden, nach 30 Tagen;
--    alle anderen, wenn sie 18 Monate weder geöffnet noch geändert wurden

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
alter table public.merklisten add constraint merklisten_ct_len check (length(ct) <= 64000) not valid;
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

-- Absenderkennung für die Begrenzung (intern, nicht für anon aufrufbar)
create or replace function public.merkliste_sender()
returns table (bucket text, quelle text)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  hd  json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  xff text := coalesce(hd->>'x-forwarded-for', '');
  ip  text; src text;
begin
  if nullif(trim(hd->>'cf-connecting-ip'), '') is not null then ip := trim(hd->>'cf-connecting-ip'); src := 'cf-connecting-ip';
  elsif nullif(trim(hd->>'x-real-ip'), '') is not null then ip := trim(hd->>'x-real-ip'); src := 'x-real-ip';
  elsif xff <> '' then ip := trim(reverse(split_part(reverse(xff), ',', 1))); src := 'x-forwarded-for (letzter Eintrag)';
  else ip := 'unbekannt'; src := 'keiner';
  end if;
  bucket := 'ip:' || left(encode(digest(ip || current_date::text || (select s from merkliste_secret limit 1), 'sha256'), 'hex'), 16);
  quelle := src;
  return next;
end $$;

-- Diagnose: zeigt, aus welchem Header die Absenderkennung stammt und einen Hash-Anfang (keine IP-Adresse).
-- Dient nur zur Prüfung, dass sich die Kennung nicht per gefälschtem Header ändern lässt.
create or replace function public.merkliste_sender_check()
returns table (quelle text, kennung text)
language sql stable security definer set search_path = public, extensions
as $$ select s.quelle, left(s.bucket, 11) from merkliste_sender() s; $$;

-- Neue Liste anlegen. Gibt die Version (1) zurück.
create or replace function public.merkliste_create(p_id uuid, p_salt text, p_has_pw boolean, p_ct text, p_write_hash text)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  h text := (select bucket from merkliste_sender());
begin
  if length(p_ct) > 64000 then raise exception 'too_large' using errcode = '22001'; end if;
  -- Aufräumen: alte Zähler; nie wieder genutzte Listen nach 30 Tagen; alle anderen nach 18 Monaten ohne Nutzung
  delete from merkliste_rl where t < now() - interval '1 day';
  delete from merklisten where version = 1 and accessed_at < created_at + interval '1 hour' and created_at < now() - interval '30 days';
  delete from merklisten where greatest(updated_at, accessed_at) < now() - interval '18 months';
  if (select count(*) from merkliste_rl where bucket = h and t > now() - interval '1 hour') >= 10
     or (select count(*) from merkliste_rl where bucket = h) >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(length(ct)), 0) from merklisten) + length(p_ct) > 300000000 then
    raise exception 'storage_full' using errcode = 'P0001';
  end if;
  insert into merkliste_rl (bucket) values (h);
  insert into merklisten (id, salt, has_pw, ct, write_hash) values (p_id, p_salt, p_has_pw, p_ct, p_write_hash);
  return 1;
end $$;

-- Liste lesen (nur mit bekannter ID; Inhalt ist verschlüsselt). Merkt sich höchstens einmal je Stunde den letzten Abruf,
-- damit genutzte, aber selten geänderte Listen nicht aufgeräumt werden.
drop function if exists public.merkliste_get(uuid);
create or replace function public.merkliste_get(p_id uuid)
returns table (salt text, has_pw boolean, ct text, version integer)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update merklisten set accessed_at = now() where id = p_id and accessed_at < now() - interval '1 hour';
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
  if length(p_ct) > 64000 then raise exception 'too_large' using errcode = '22001'; end if;
  if not exists (select 1 from merklisten where id = p_id and write_hash = h) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(p_ct) > (select length(ct) from merklisten where id = p_id)
     and (select coalesce(sum(length(ct)), 0) from merklisten) - (select length(ct) from merklisten where id = p_id) + length(p_ct) > 300000000 then
    raise exception 'storage_full' using errcode = 'P0001';
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

revoke all on function public.merkliste_sender() from public, anon, authenticated;
revoke all on function public.merkliste_sender_check() from public;
grant execute on function public.merkliste_sender_check() to anon, authenticated;
revoke all on function public.merkliste_create(uuid, text, boolean, text, text) from public;
revoke all on function public.merkliste_get(uuid) from public;
revoke all on function public.merkliste_update(uuid, text, text, integer) from public;
revoke all on function public.merkliste_delete(uuid, text) from public;
grant execute on function public.merkliste_create(uuid, text, boolean, text, text) to anon, authenticated;
grant execute on function public.merkliste_get(uuid) to anon, authenticated;
grant execute on function public.merkliste_update(uuid, text, text, integer) to anon, authenticated;
grant execute on function public.merkliste_delete(uuid, text) to anon, authenticated;
