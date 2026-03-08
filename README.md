# omnifact-xwiki-sync

CLI tool that syncs wiki articles from XWiki to [Omnifact](https://omnifact.ai) Spaces for RAG. Fetches pages via the XWiki REST API, converts them to Markdown, and uploads them as documents to Omnifact Spaces.

## Features

- Configurable routing: map XWiki spaces to Omnifact Space IDs
- Incremental sync: tracks page versions, only syncs changes
- Handles new, updated, and deleted pages
- Attachment syncing with configurable filetype allowlist
- Nested XWiki spaces supported (e.g. `Engineering.Backend.APIs`)
- Dry-run mode to preview changes

## Setup

```bash
npm install
cp .env.example .env
cp config.example.yaml config.yaml
```

Edit `.env` with your secrets:

```
XWIKI_PASSWORD=your-password
OMNIFACT_API_KEY=your-api-key
```

Edit `config.yaml` to define your XWiki → Omnifact space mappings.

## Usage

```bash
# Sync all configured routes
npx omnifact-xwiki-sync sync

# Sync a specific space only
npx omnifact-xwiki-sync sync --space Engineering

# Preview changes without syncing
npx omnifact-xwiki-sync sync --dry-run

# Show current sync state
npx omnifact-xwiki-sync status

# Use a custom config file
npx omnifact-xwiki-sync sync --config my-config.yaml
```

## Configuration

The tool is configured through a YAML file (default: `config.yaml`) and a `.env` file for secrets. Any string value in the YAML can reference environment variables using the `${VAR_NAME}` syntax — these are substituted at load time from your `.env` file or shell environment.

### Full example

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
  includeTypes: ["pdf", "png", "jpg", "jpeg", "gif", "svg", "docx", "xlsx"]
```

### Sections

#### `xwiki` (required)

Connection details for the XWiki instance.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `baseUrl` | yes | — | Base URL of the XWiki instance (no trailing slash) |
| `username` | yes | — | Username for HTTP Basic Auth |
| `password` | yes | — | Password. Use `${XWIKI_PASSWORD}` to read from `.env` |
| `wiki` | no | `"xwiki"` | Wiki name in the XWiki REST path. Almost always `"xwiki"` |

#### `omnifact` (required)

Connection details for the Omnifact API.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `apiKey` | yes | — | Omnifact API key. Use `${OMNIFACT_API_KEY}` to read from `.env` |
| `baseUrl` | yes | — | Omnifact API base URL |

#### `routes` (required, at least one)

Each route maps one XWiki space to one Omnifact Space. Pages in the XWiki space are synced as documents to the target Omnifact Space.

| Field | Required | Description |
|-------|----------|-------------|
| `xwikiSpace` | yes | XWiki space name. Use dot notation for nested spaces (e.g. `"Engineering.Backend.APIs"`) |
| `omnifactSpaceId` | yes | Target Omnifact Space UUID |
| `exclude` | no | List of patterns to exclude. Uses `%` as wildcard (like SQL `LIKE`). Matched against the page's full name (e.g. `"Product.Internal%"` excludes all pages under `Product.Internal`) |

You can define multiple routes to sync different XWiki spaces to different Omnifact Spaces. Run `sync --space <name>` to sync a single route.

#### `sync` (optional)

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `stateFile` | no | `".sync-state.json"` | Path to the local state file that tracks which pages have been synced and their Omnifact document IDs. This file is the sync's source of truth — it avoids hitting the Omnifact API to list documents on every run |

The state file is a JSON file that stores, per page: the Omnifact document ID, the last-modified timestamp, the XWiki version string, and any attachment document IDs. Do not delete this file unless you want to re-sync everything from scratch.

#### `attachments` (optional)

Controls whether file attachments on XWiki pages are synced to Omnifact.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `enabled` | no | `false` | Set to `true` to sync attachments |
| `includeTypes` | no | `[]` | File extensions to include (without the dot). Only attachments matching these extensions are synced. Example: `["pdf", "docx", "png"]` |

Each attachment is uploaded as a separate document to Omnifact, named `"PageName - filename.ext"`.

### Environment variable substitution

Any string value in the config can contain `${VAR_NAME}` placeholders. These are replaced with the corresponding environment variable at load time. Variables are read from a `.env` file in the working directory (via [dotenv](https://www.npmjs.com/package/dotenv)) and from the shell environment.

If a referenced variable is not set, the tool exits with an error naming the missing variable.

## Development

```bash
# Run in development mode
npm run dev -- sync --dry-run

# Build for production
npm run build

# Run built version
npm start -- sync
```

## License

MIT — Copyright (c) 2026 Omnifact GmbH

Published by Omnifact GmbH. No support or guarantees provided.
