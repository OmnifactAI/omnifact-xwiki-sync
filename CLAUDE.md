# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev -- sync --dry-run          # Run in dev mode (tsx, no build needed)
npm run dev -- sync --space Engineering # Sync only one space
npm run dev -- sync --debug            # Log every HTTP request URL
npm run dev -- status                  # Show current sync state
npm run dev -- list-wikis              # Recursively list all pages in configured spaces
npm run build                          # Compile TypeScript to dist/
npm start -- sync                      # Run compiled version
```

No test framework is configured. No linter is configured.

## Architecture

CLI tool that syncs XWiki wiki pages → Omnifact Spaces (for RAG). Fetches pages via XWiki REST API, converts HTML to Markdown (turndown), uploads as documents to Omnifact.

**Data flow:** `config.yaml` → load config with env var substitution → for each route, fetch XWiki pages → diff against local state file → create/update/delete Omnifact documents → save state.

### Key modules

- `src/index.ts` — CLI entry point (commander). Commands: `sync` (with `--dry-run`, `--space`, `--debug`), `status`, and `list-wikis`.
- `src/config.ts` — YAML config loader with `${VAR}` env substitution from `.env`/shell. `xwiki.wiki` defaults to `"xwiki"` if omitted.
- `src/xwiki/client.ts` — XWiki REST API client. `listAllPages(rootSpace)` recursively traverses the hierarchy: fetches pages at each space, then calls `GET /pages/{page}/children` on each page to discover nested spaces (XWiki has no "list child spaces" endpoint). Sets `page.space` and `page.fullName` explicitly during traversal. Dot-separated space names encode to `spaces/A/spaces/B` REST paths.
- `src/omnifact/client.ts` — Omnifact API client. Upload (multipart form) and delete documents. Auth via `X-API-Key` header.
- `src/converter.ts` — HTML→Markdown via turndown. Prepends page title as `# heading`.
- `src/sync/engine.ts` — Core sync logic. `syncRoute` does the actual sync; `dryRunRoute` previews changes. Update = delete old doc + re-upload (no PATCH endpoint exists).
- `src/sync/state.ts` — JSON state file read/write. Tracks per-page: Omnifact doc ID, last modified timestamp, XWiki version, attachment doc IDs.

### Sync logic

Change detection compares XWiki's `modified` timestamp against `lastModified` in the state file. Pages are skipped if `modified <= lastModified`. Exclude patterns match against `page.fullName` (e.g. `"Product.Internal%"` where `%` is a wildcard).

State is keyed by `page.fullName` (e.g. `Main.SubPage.WebHome`) within each route's space entry. Omnifact document names use `page.fullName`; filenames use `page.fullName` with dots replaced by dashes (e.g. `Main-SubPage-WebHome.md`). Content and attachment fetches use `page.space` (the actual nested space path) rather than the route's root space.

Attachments are uploaded as separate Omnifact documents linked to the same page URL metadata. Their IDs are tracked in `attachmentDocIds` on the page state so they can be deleted on update/delete.

### Config

`config.yaml` with env var substitution (`${VAR_NAME}`). Routes map XWiki spaces to Omnifact Space UUIDs. Exclude patterns use `%` as wildcard (SQL LIKE style, converted to regex internally). State file defaults to `.sync-state.json`.

### TypeScript

ESM (`"type": "module"`), NodeNext module resolution. All imports use `.js` extensions. Strict mode. Target ES2022.
