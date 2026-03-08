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

See `config.example.yaml` for the full config format. Environment variables referenced as `${VAR_NAME}` in the YAML config are substituted from `.env`.

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
