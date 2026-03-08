# XWiki → Omnifact Spaces Sync Tool — Plan

## Context
CLI tool that syncs wiki articles from XWiki to Omnifact Spaces (RAG). Articles fetched via XWiki REST API, converted to Markdown, uploaded as documents to Omnifact Spaces. YAML config defines routing: which XWiki spaces map to which Omnifact space IDs. Handles new, updated, and deleted articles.

## Tech Stack
- **Runtime:** Node.js + TypeScript
- **Build:** tsx (dev), tsup or tsc (build)
- **Key deps:** axios (HTTP), turndown (HTML→Markdown), js-yaml, commander (CLI), dotenv
- **Config:** YAML file + `.env` for secrets

## Architecture

### Project Structure
```
omnifact-xiwki-sync/
├── src/
│   ├── index.ts           # CLI entry point (commander)
│   ├── config.ts          # YAML config loader + types
│   ├── xwiki/
│   │   ├── client.ts      # XWiki REST API client
│   │   └── types.ts       # XWiki response types
│   ├── omnifact/
│   │   ├── client.ts      # Omnifact API client
│   │   └── types.ts       # Omnifact response types
│   ├── sync/
│   │   ├── engine.ts      # Core sync logic (diff, create, update, delete)
│   │   └── state.ts       # Local state store (tracks last sync per page)
│   └── converter.ts       # XWiki HTML → Markdown conversion
├── config.example.yaml
├── .env.example
├── package.json
├── tsconfig.json
└── .gitignore
```

### Config Format (`config.yaml`)
```yaml
xwiki:
  baseUrl: "https://wiki.example.com"
  username: "syncbot"
  password: "${XWIKI_PASSWORD}" # from .env
  wiki: "xwiki"   # wiki name, default "xwiki"

omnifact:
  apiKey: "${OMNIFACT_API_KEY}" # from .env
  baseUrl: "https://connect.omnifact.ai"

routes:
  - xwikiSpace: "Engineering"
    omnifactSpaceId: "space-uuid-1"
  - xwikiSpace: "Product"
    omnifactSpaceId: "space-uuid-2"
    # optional: exclude patterns
    exclude: ["Product.Internal%"]
  # nested spaces supported, e.g.:
  - xwikiSpace: "Engineering.Backend.APIs"
    omnifactSpaceId: "space-uuid-3"

sync:
  stateFile: ".sync-state.json"  # tracks what was synced

attachments:
  enabled: true
  includeTypes: ["pdf", "png", "jpg", "jpeg", "gif", "svg", "docx", "xlsx"]
```

### XWiki API Usage
- **Nested spaces:** encoded as `/spaces/Engineering/spaces/Backend/spaces/APIs/pages` in the REST URL
- **List pages in space:** `GET /rest/wikis/{wiki}/spaces/{space}/pages` → returns page summaries with `modified` date
- **Get page content:** `GET /rest/wikis/{wiki}/spaces/{space}/pages/{page}?media=json` → includes `content` (xwiki markup) and rendered HTML via `GET .../pages/{page}/history` or by requesting rendered content
- **Rendered HTML:** `GET /rest/wikis/{wiki}/spaces/{space}/pages/{page}?media=json` — use the `content` field, or fetch `/xwiki/bin/view/{space}/{page}` for rendered HTML
- **Auth:** HTTP Basic Auth
- **Pagination:** `start` (offset) + `number` (limit), max 1000 per request

### Omnifact API Usage
- **List docs:** `GET /v1/documents?spaceId={id}` — paginated, returns name + id
- **Upload doc:** `POST /v1/documents?spaceId={id}` — multipart/form-data, `file` field (Markdown as `.md` file), `name` field
- **Update doc:** `DELETE` old + `POST` new (no content update endpoint, only name via PATCH)
- **Delete doc:** `DELETE /v1/documents/{id}`
- **Auth:** `X-API-Key` header

### Sync Logic (engine.ts)

For each route:
1. **Fetch** all pages from XWiki space (paginated)
2. **Load** local sync state (page → {lastModified, omnifactDocId})
3. **Diff:**
   - New pages (in XWiki, not in state) → convert + upload
   - Modified pages (XWiki `modified` > state `lastModified`) → delete old doc + upload new
   - Deleted pages (in state, not in XWiki) → delete from Omnifact
   - Unchanged → skip
4. **Convert** page HTML → Markdown via turndown
5. **Fetch attachments** matching configured filetypes from XWiki page
6. **Upload** page as `.md` file + attachments to Omnifact (multipart)
7. **Update** local state file

**No rate limiting** on Omnifact API — no throttling needed.

### State File (`.sync-state.json`)
```json
{
  "Engineering": {
    "PageName": {
      "omnifactDocId": "doc-uuid",
      "lastModified": "2024-01-15T10:30:00Z",
      "xwikiVersion": "3.1"
    }
  }
}
```

### CLI Interface
```bash
# Sync all configured routes
npx omnifact-xwiki-sync sync

# Sync specific route only
npx omnifact-xwiki-sync sync --space Engineering

# Dry run (show what would change)
npx omnifact-xwiki-sync sync --dry-run

# Show current sync state
npx omnifact-xwiki-sync status
```

## Implementation Order
1. Project scaffold (package.json, tsconfig, deps)
2. Config loader + types
3. XWiki client (list pages, get content)
4. Markdown converter (HTML → MD via turndown)
5. Omnifact client (list/upload/delete docs)
6. Sync engine (diff + orchestration)
7. State management
8. CLI entry point
9. Error handling, logging, retries

## Verification
- Unit test: converter with sample XWiki HTML
- Manual: run `sync --dry-run` against real XWiki instance, verify output
- Manual: run `sync` for one space, check docs appear in Omnifact
- Manual: edit a page in XWiki, re-run sync, verify update
- Manual: delete a page in XWiki, re-run sync, verify removal

## Decisions
1. **Secrets:** `.env` file only (via dotenv), not in config YAML
2. **Nested spaces:** Supported — e.g. `Engineering.Backend.APIs` maps to nested XWiki REST path
3. **Attachments:** Synced, with configurable filetype allowlist in `config.yaml`
4. **Rate limiting:** Omnifact API has no rate limits, no throttling needed
