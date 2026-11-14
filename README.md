# Leuchten für EUTRAC

Filterbare Übersicht über Leuchten für EUTRAC-3-Phasen-Stromschienen (SLV, Deko-Light, ISOLED) mit einer Merkliste nach Raum.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `style.css` | Gestaltung |
| `leuchten.json` | **Leuchtendaten** – eine Leuchte pro Zeile; hier ergänzen/ändern. `model` ist der angezeigte Name, `modelOrig` (falls vorhanden) die Originalbezeichnung im Shop |
| `app.js` | Filter, Tabelle, Merkliste |
| `guide.js` | Einsteigerführung: Fortschritt an den Reitern, „Nächster Schritt“, Hilfetexte ein/aus (siehe docs/ux-flow-2026-11-02.md) |
| `belegung.html`, `belegung.js` | Belegung: Leuchten eines Raums auf die Schiene setzen, auf Stromkreis L1–L3 verteilen, KNX-Dimm-/Schaltaktor und Kanal zuordnen (MDT AKD-0401.02, AKS-2016.03 oder eigene Werte), Last- und Dimmprüfung, Schaltliste |
| `schiene.html`, `schiene.js`, `schiene-engine.js` | Schienenplaner: Stückliste für die EUTRAC 3~ Aufbauschiene mit Schutzleiter-Logik – gerade Schiene per Länge oder beliebige Form auf dem Raster zeichnen (L, T, U, H, 8, X, Rahmen; Vorlagen, Rückgängig, Ansicht von unten). Pläne lassen sich einem Raum der Merkliste zuordnen (lokal im Cookie oder in der gemeinsamen, verschlüsselten Liste) und erscheinen im Lichtplan und im Druck. Tests: `node tests/schiene-engine.test.js` |
| `tour.js` | Einführungstour (beim ersten Besuch automatisch, sonst über „Tour“ in der Fußzeile) |
| `merkliste-store.js` | Speichert die Merkliste: lokal im Sitzungs-Cookie oder gemeinsam (verschlüsselt) in Supabase |
| `config.js` | Zugangsdaten für Supabase (leer = nur lokale Merkliste) |
| `supabase/schema.sql` | Datenbank-Einrichtung für gemeinsame Listen |
| `impressum.html`, `datenschutz.html` | Impressum und Datenschutzerklärung |
| `fonts/`, `fonts.css` | Schrift Archivo (variable Breite und Stärke), lokal ausgeliefert (SIL OFL) |
| `vendor/` | supabase-js 2.117.3 (MIT), lokal ausgeliefert |

Die Seite lädt keine Ressourcen von fremden Servern. Verbindungen zu Supabase entstehen nur bei Nutzung einer gemeinsamen Liste.

## Merkliste

Räume, Verwendungen und gemerkte Leuchten werden in Sitzungs-Cookies (`merkliste_*`, ohne Ablaufdatum) gespeichert.
Sie bleiben beim Neuladen und in weiteren Tabs erhalten und werden gelöscht, wenn der Browser beendet wird.
Die Merkliste ist nur im eigenen Browser sichtbar. Damit die Cookies klein bleiben, ist sie auf rund 200 Zuordnungen begrenzt.

## Gemeinsame Merkliste

Über „Gemeinsam bearbeiten …“ wird die Merkliste als gemeinsame Liste angelegt. Wer den Link hat (plus optional das Passwort), kann sie ansehen und ändern. Änderungen erscheinen bei allen sofort.

- **Ende-zu-Ende-verschlüsselt:** Der Link enthält Listen-ID und einen zufälligen Schlüssel im `#`-Teil, der nie an einen Server geht. Aus Schlüssel und Passwort leitet der Browser per PBKDF2 (310 000 Runden) einen AES-GCM-Schlüssel und ein Schreib-Token ab. Supabase speichert nur Chiffretext und einen Hash des Schreib-Tokens.
- **Schreiben** geht nur mit gültigem Schreib-Token. Gleichzeitige Änderungen werden erkannt (Versionsnummer) und automatisch auf den neuesten Stand angewendet.
- **Passwort vergessen** = Liste nicht mehr lesbar. Es gibt keine Wiederherstellung.
- Der abgeleitete Schlüssel bleibt nur im jeweiligen Browser-Tab (sessionStorage), in einem neuen Tab wird das Passwort erneut abgefragt.

### Einrichtung (einmalig)

1. Auf [supabase.com](https://supabase.com) ein kostenloses Projekt anlegen (Region z. B. Frankfurt).
2. Im Dashboard unter **SQL Editor** den Inhalt von `supabase/schema.sql` ausführen.
3. Unter **Project Settings → API** die *Project URL* und den *anon public*-Schlüssel in `config.js` eintragen.
4. Unter **Realtime → Settings** muss der öffentliche Zugriff auf Kanäle erlaubt sein (Standard); sonst aktualisiert sich die Liste nur beim Zurückkehren zum Tab bzw. alle 20 Sekunden.
5. Supabase pausiert kostenlose Projekte nach 7 Tagen ohne Nutzung. Der GitHub-Workflow `.github/workflows/supabase-keepalive.yml` fragt die Datenbank deshalb zweimal täglich mit einigen kurzen Abfragen ab (`merkliste_sender_check` und `merkliste_get` mit einer zufälligen, nicht vorhandenen ID; keine Listendaten). Zweimal pro Woche hat nicht gereicht. Als zweite, unabhängige Quelle gibt es einen fertigen Portainer-/Docker-Compose-Stack in `deploy/portainer-supabase-keepalive.yml` (Anleitung in der Datei), der alle 6 Stunden abfragt. GitHub stoppt geplante Workflows nach 60 Tagen ohne Commit im Repository; dann unter **Actions** wieder aktivieren.

## Lokal ansehen

`leuchten.json` wird per `fetch` geladen, deshalb braucht es einen kleinen Webserver:

```bash
python3 -m http.server
```


## Sicherheit

- Gemeinsame Listen sind im Browser verschlüsselt (AES-256-GCM, Schlüssel nur im `#`-Teil des Links); die Datenbank sieht nur Chiffretext.
- Alles, was aus Cookies oder gemeinsamen Listen geladen wird, wird beim Laden geprüft (`sanitize` in `merkliste-store.js`) und bei der Anzeige maskiert.
- Content-Security-Policy in allen Seiten (keine Inline-Skripte), Schutz gegen Einbetten (`frame-guard.js`).
- Datenbank: nur über vier Funktionen erreichbar, Größen- und Mengenbegrenzung, automatisches Aufräumen (`supabase/schema.sql`, nach Änderungen im SQL Editor erneut ausführen).
- Bericht und Umsetzung: [docs/security-2026-11-02.md](docs/security-2026-11-02.md); Angriffstest: `tests/xss-shared-list.poc.js`.

## Lizenz

Copyright (C) 2026 Andreas Bosch.

- **Programm** (HTML, CSS, JavaScript, SQL): [GNU AGPL 3.0 oder später](LICENSE) (`AGPL-3.0-or-later`).
  Wer eine geänderte Fassung weitergibt oder als Webdienst betreibt, muss deren Quellcode unter derselben Lizenz offenlegen.
- **Zusatzbedingung nach Abschnitt 7 b) – Namensnennung:** In der Oberfläche muss sichtbar bleiben:
  „Basiert auf ‚Lichtplaner für EUTRAC‘ von Andreas Bosch (https://github.com/Andr3asB/eutrac-leuchten)“. Details in [NOTICE](NOTICE).
- **Leuchtendaten** (`leuchten.json`): [CC BY-SA 4.0](LICENSE-DATA.md).
- Fremde Bestandteile mit eigener Lizenz: Schrift Archivo (SIL OFL 1.1, `fonts/`), supabase-js (MIT, `vendor/`).
