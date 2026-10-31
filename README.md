# Leuchten für EUTRAC

Filterbare Übersicht über Leuchten für EUTRAC-3-Phasen-Stromschienen (SLV, Deko-Light, ISOLED) mit einer Merkliste nach Raum.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `style.css` | Gestaltung |
| `leuchten.json` | **Leuchtendaten** – eine Leuchte pro Zeile; hier ergänzen/ändern |
| `app.js` | Filter, Tabelle, Merkliste |
| `tour.js` | Einführungstour (beim ersten Besuch automatisch, sonst über „Tour“ in der Fußzeile) |
| `merkliste-store.js` | Speichert die Merkliste: lokal im Sitzungs-Cookie oder gemeinsam (verschlüsselt) in Supabase |
| `config.js` | Zugangsdaten für Supabase (leer = nur lokale Merkliste) |
| `supabase/schema.sql` | Datenbank-Einrichtung für gemeinsame Listen |
| `impressum.html`, `datenschutz.html` | Impressum und Datenschutzerklärung |
| `fonts/`, `fonts.css` | Schriften Archivo und IBM Plex Mono, lokal ausgeliefert (SIL OFL) |
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

## Lokal ansehen

`leuchten.json` wird per `fetch` geladen, deshalb braucht es einen kleinen Webserver:

```bash
python3 -m http.server
```
