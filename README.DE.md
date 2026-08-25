# omnifact-xwiki-sync

CLI-Tool zum Synchronisieren von Wiki-Artikeln aus XWiki in [Omnifact](https://omnifact.ai) Spaces für RAG. Seiten werden über die XWiki REST API abgerufen, in Markdown konvertiert und als Dokumente in Omnifact Spaces hochgeladen.

## Funktionen

- Konfigurierbare Routen: XWiki Spaces auf Omnifact Space IDs abbilden
- Inkrementelle Synchronisierung: verfolgt Seitenversionen, synchronisiert nur Änderungen
- Erkennt neue, aktualisierte und gelöschte Seiten
- Vollständige rekursive Traversierung von verschachtelten XWiki Spaces und Unterseiten
- Anhang-Synchronisierung mit konfigurierbarer Dateiformat-Zulassungsliste
- Dry-Run-Modus zur Vorschau von Änderungen
- `list-wikis`-Befehl zur Überprüfung, was synchronisiert werden würde

## Einrichtung

```bash
npm install
cp .env.example .env
cp config.example.yaml config.yaml
```

`.env` mit den Zugangsdaten befüllen:

```
XWIKI_PASSWORD=ihr-passwort
OMNIFACT_API_KEY=ihr-api-schluessel
```

`config.yaml` bearbeiten, um die XWiki → Omnifact Space-Zuordnungen zu definieren.

## Verwendung

```bash
# Alle Seiten anzeigen, die synchronisiert werden würden (empfohlener erster Schritt)
npx omnifact-xwiki-sync list-wikis

# Änderungen vorab anzeigen, ohne zu synchronisieren
npx omnifact-xwiki-sync sync --dry-run

# Alle konfigurierten Routen synchronisieren
npx omnifact-xwiki-sync sync

# Nur einen bestimmten Space synchronisieren
npx omnifact-xwiki-sync sync --space Engineering

# Aktuellen Synchronisierungsstatus anzeigen
npx omnifact-xwiki-sync status

# Eine alternative Konfigurationsdatei verwenden
npx omnifact-xwiki-sync sync --config meine-config.yaml

# HTTP-Anfragen debuggen (gibt jede URL und Fehlerantworten aus)
npx omnifact-xwiki-sync sync --debug
```

## Konfiguration

Das Tool wird über eine YAML-Datei (Standard: `config.yaml`) und eine `.env`-Datei für Geheimnisse konfiguriert. Jeder String-Wert in der YAML-Datei kann Umgebungsvariablen über die `${VAR_NAME}`-Syntax referenzieren — diese werden beim Laden aus der `.env`-Datei oder der Shell-Umgebung ersetzt.

### Vollständiges Beispiel

```yaml
xwiki:
  baseUrl: "https://wiki.example.com"
  username: "syncbot"
  password: "${XWIKI_PASSWORD}"
  wiki: "xwiki"

omnifact:
  apiKey: "${OMNIFACT_API_KEY}"
  baseUrl: "https://connect.omnifact.ai"

routes:
  - xwikiSpace: "Engineering"
    omnifactSpaceId: "space-uuid-1"
  - xwikiSpace: "Product"
    omnifactSpaceId: "space-uuid-2"
    exclude: ["Product.Internal%"]
  - xwikiSpace: "Engineering.Backend.APIs"
    omnifactSpaceId: "space-uuid-3"

sync:
  stateFile: ".sync-state.json"

attachments:
  enabled: true
  includeTypes: ["pdf", "svg", "docx", "pptx", "odt"]
```

### Abschnitte

#### `xwiki` (erforderlich)

Verbindungsdetails für die XWiki-Instanz.

| Feld | Erforderlich | Standard | Beschreibung |
|------|-------------|----------|--------------|
| `baseUrl` | ja | — | Basis-URL der XWiki-Instanz (ohne abschließenden Schrägstrich) |
| `username` | ja | — | Benutzername für HTTP Basic Auth |
| `password` | ja | — | Passwort. `${XWIKI_PASSWORD}` verwenden, um aus `.env` zu lesen |
| `wiki` | nein | `"xwiki"` | Wiki-Name im XWiki REST-Pfad. Fast immer `"xwiki"` |

#### `omnifact` (erforderlich)

Verbindungsdetails für die Omnifact API.

| Feld | Erforderlich | Standard | Beschreibung |
|------|-------------|----------|--------------|
| `apiKey` | ja | — | Omnifact API-Schlüssel. `${OMNIFACT_API_KEY}` verwenden, um aus `.env` zu lesen |
| `baseUrl` | ja | — | Omnifact API Basis-URL |

#### `routes` (erforderlich, mindestens eine)

Jede Route bildet einen XWiki Space auf einen Omnifact Space ab. Seiten im XWiki Space werden als Dokumente in den Ziel-Omnifact-Space synchronisiert. Verschachtelte Spaces werden vollständig rekursiv durchsucht — es ist nicht nötig, Unterseiten explizit aufzulisten.

| Feld | Erforderlich | Beschreibung |
|------|-------------|--------------|
| `xwikiSpace` | ja | XWiki Space-Name. Punkt-Notation für verschachtelte Spaces verwenden (z.B. `"Engineering.Backend.APIs"`) |
| `omnifactSpaceId` | ja | Ziel-Omnifact-Space-UUID |
| `exclude` | nein | Liste von Ausschlussmustern. Verwendet `%` als Platzhalter (wie SQL `LIKE`). Wird gegen den vollständigen Seitennamen geprüft (z.B. schließt `"Product.Internal%"` alle Seiten unter `Product.Internal` aus). Bereits synchronisierte Seiten, die auf ein neu hinzugefügtes Ausschlussmuster passen, werden beim nächsten Sync aus Omnifact gelöscht |

Es können mehrere Routen definiert werden, um verschiedene XWiki Spaces in verschiedene Omnifact Spaces zu synchronisieren. Mit `sync --space <name>` wird nur eine einzelne Route synchronisiert.

#### `sync` (optional)

| Feld | Erforderlich | Standard | Beschreibung |
|------|-------------|----------|--------------|
| `stateFile` | nein | `".sync-state.json"` | Pfad zur lokalen Statusdatei, die verfolgt, welche Seiten synchronisiert wurden und ihre Omnifact-Dokument-IDs. Diese Datei ist die Quelle der Wahrheit — sie vermeidet, bei jedem Lauf die Omnifact API nach Dokumenten abzufragen |

Die Statusdatei ist eine JSON-Datei, die pro Seite speichert: die Omnifact-Dokument-ID, den Zeitstempel der letzten Änderung, die XWiki-Versionszeichenkette und alle Anhang-Dokument-IDs. Diese Datei nicht löschen, es sei denn, alles soll von Grund auf neu synchronisiert werden.

#### `attachments` (optional)

Steuert, ob Dateianhänge von XWiki-Seiten nach Omnifact synchronisiert werden.

| Feld | Erforderlich | Standard | Beschreibung |
|------|-------------|----------|--------------|
| `enabled` | nein | `false` | Auf `true` setzen, um Anhänge zu synchronisieren |
| `includeTypes` | nein | `[]` | Einzuschließende Dateiendungen (ohne Punkt). Nur Anhänge mit diesen Endungen werden synchronisiert. Beispiel: `["pdf", "docx", "svg"]` |

Es können nur von Omnifact unterstützte Dateitypen synchronisiert werden: `txt`, `json`, `md`, `markdown`, `csv`, `svg`, `pdf`, `doc`, `dot`, `docx`, `dotx`, `odt`, `ott`, `ppt`, `pot`, `pps`, `pptx`, `ppsx`, `potx`, `odp`, `otp`. Nicht unterstützte Einträge in `includeTypes` werden mit einer Warnung ignoriert.

Jeder Anhang wird als separates Dokument in Omnifact hochgeladen, benannt nach `"Space.UnterSpace.Seitenname - dateiname.ext"`.

### Umgebungsvariablen-Substitution

Jeder String-Wert in der Konfiguration kann `${VAR_NAME}`-Platzhalter enthalten. Diese werden beim Laden durch die entsprechende Umgebungsvariable ersetzt. Variablen werden aus einer `.env`-Datei im Arbeitsverzeichnis (über [dotenv](https://www.npmjs.com/package/dotenv)) und aus der Shell-Umgebung gelesen.

Wenn eine referenzierte Variable nicht gesetzt ist, beendet sich das Tool mit einem Fehler, der die fehlende Variable benennt.

## Docker

```bash
docker build -t omnifact-xwiki-sync .

# Einmaliger Sync; Zeitplanung über Host-Cron, systemd-Timer oder Kubernetes CronJob
docker run --rm \
  --env-file .env \
  -v ./config.yaml:/app/config.yaml:ro \
  -v omnifact-sync-data:/data \
  omnifact-xwiki-sync sync
```

In `config.yaml` `sync.stateFile: "/data/sync-state.json"` setzen, damit der Synchronisierungsstatus im Volume `omnifact-sync-data` über Läufe hinweg erhalten bleibt. Jeder CLI-Befehl kann als Container-Befehl übergeben werden (`sync --dry-run`, `list-wikis`, `status`). Der Container beendet sich mit einem Exit-Code ungleich null, wenn eine Seite nicht synchronisiert werden konnte, sodass Scheduler Fehler erkennen können.

## Entwicklung

```bash
# Im Entwicklungsmodus ausführen (kein Build erforderlich)
npm run dev -- sync --dry-run
npm run dev -- list-wikis

# Für Produktion bauen
npm run build

# Gebaute Version ausführen
npm start -- sync
```

## Lizenz

MIT — Copyright (c) 2026 Omnifact GmbH

Veröffentlicht von Omnifact GmbH. Kein Support oder Garantien.
