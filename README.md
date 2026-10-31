# Leuchten für EUTRAC

Filterbare Übersicht über Leuchten für EUTRAC-3-Phasen-Stromschienen (SLV, Deko-Light, ISOLED) mit einer Merkliste nach Raum.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `style.css` | Gestaltung |
| `leuchten.json` | **Leuchtendaten** – eine Leuchte pro Zeile; hier ergänzen/ändern |
| `app.js` | Filter, Tabelle, Merkliste |
| `merkliste-store.js` | Speichert die Merkliste in einem Sitzungs-Cookie |

## Merkliste

Räume, Verwendungen und gemerkte Leuchten werden in Sitzungs-Cookies (`merkliste_*`, ohne Ablaufdatum) gespeichert.
Sie bleiben beim Neuladen und in weiteren Tabs erhalten und werden gelöscht, wenn der Browser beendet wird.
Die Merkliste ist nur im eigenen Browser sichtbar. Damit die Cookies klein bleiben, ist sie auf rund 200 Zuordnungen begrenzt.

## Lokal ansehen

`leuchten.json` wird per `fetch` geladen, deshalb braucht es einen kleinen Webserver:

```bash
python3 -m http.server
```
