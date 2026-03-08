import type { Route, AttachmentsConfig } from "../config.js";
import type { XWikiClient } from "../xwiki/client.js";
import type { OmnifactClient } from "../omnifact/client.js";
import type { SyncState, PageState } from "./state.js";
import { convertToMarkdown } from "../converter.js";

export interface SyncSummary {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

export async function syncRoute(
  route: Route,
  xwikiClient: XWikiClient,
  omnifactClient: OmnifactClient,
  state: SyncState,
  attachmentsConfig: AttachmentsConfig
): Promise<{ state: SyncState; summary: SyncSummary }> {
  const space = route.xwikiSpace;
  const spaceState = state[space] || {};
  const summary: SyncSummary = { created: 0, updated: 0, deleted: 0, skipped: 0, errors: [] };

  // Fetch all pages from XWiki
  const pages = await xwikiClient.listPages(space);
  const pageNames = new Set(pages.map((p) => p.name));

  // Process each page
  for (const page of pages) {
    const existing = spaceState[page.name];

    // Check exclude patterns
    if (route.exclude?.some((pattern) => {
      const regex = new RegExp("^" + pattern.replace(/%/g, ".*") + "$");
      return regex.test(page.fullName);
    })) {
      summary.skipped++;
      continue;
    }

    const isNew = !existing;
    const isModified = existing && page.modified > existing.lastModified;

    if (!isNew && !isModified) {
      summary.skipped++;
      continue;
    }

    try {
      // Delete old doc if updating
      if (isModified && existing) {
        await omnifactClient.deleteDocument(existing.omnifactDocId);
        if (existing.attachmentDocIds) {
          for (const attDocId of existing.attachmentDocIds) {
            await omnifactClient.deleteDocument(attDocId);
          }
        }
      }

      // Fetch page content and convert
      const detail = await xwikiClient.getPageContent(space, page.name);
      const markdown = convertToMarkdown(detail.content, detail.title || page.name);
      const mdBuffer = Buffer.from(markdown, "utf-8");
      const filename = `${page.name}.md`;

      // Upload markdown with XWiki page URL as metadata
      const pageUrl = xwikiClient.getPageViewUrl(space, page.name);
      const doc = await omnifactClient.uploadDocument(
        route.omnifactSpaceId,
        page.name,
        mdBuffer,
        filename,
        { url: pageUrl }
      );

      const pageState: PageState = {
        omnifactDocId: doc.id,
        lastModified: page.modified,
        xwikiVersion: detail.version,
      };

      // Handle attachments
      if (attachmentsConfig.enabled) {
        const attachments = await xwikiClient.listAttachments(space, page.name);
        const allowedExts = new Set(attachmentsConfig.includeTypes);
        const attDocIds: string[] = [];

        for (const att of attachments) {
          const ext = getExtension(att.name);
          if (!allowedExts.has(ext)) continue;

          try {
            const attBuffer = await xwikiClient.downloadAttachment(space, page.name, att.name);
            const attDoc = await omnifactClient.uploadDocument(
              route.omnifactSpaceId,
              `${page.name} - ${att.name}`,
              attBuffer,
              att.name,
              { url: pageUrl }
            );
            attDocIds.push(attDoc.id);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            summary.errors.push(`Attachment ${att.name} on ${page.name}: ${msg}`);
          }
        }

        if (attDocIds.length > 0) {
          pageState.attachmentDocIds = attDocIds;
        }
      }

      spaceState[page.name] = pageState;
      if (isNew) summary.created++;
      else summary.updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${page.name}: ${msg}`);
    }
  }

  // Handle deleted pages
  for (const pageName of Object.keys(spaceState)) {
    if (!pageNames.has(pageName)) {
      try {
        await omnifactClient.deleteDocument(spaceState[pageName].omnifactDocId);
        if (spaceState[pageName].attachmentDocIds) {
          for (const attDocId of spaceState[pageName].attachmentDocIds!) {
            await omnifactClient.deleteDocument(attDocId);
          }
        }
        delete spaceState[pageName];
        summary.deleted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push(`Delete ${pageName}: ${msg}`);
      }
    }
  }

  state[space] = spaceState;
  return { state, summary };
}

export async function dryRunRoute(
  route: Route,
  xwikiClient: XWikiClient,
  state: SyncState
): Promise<SyncSummary> {
  const space = route.xwikiSpace;
  const spaceState = state[space] || {};
  const summary: SyncSummary = { created: 0, updated: 0, deleted: 0, skipped: 0, errors: [] };

  const pages = await xwikiClient.listPages(space);
  const pageNames = new Set(pages.map((p) => p.name));

  for (const page of pages) {
    const existing = spaceState[page.name];

    if (route.exclude?.some((pattern) => {
      const regex = new RegExp("^" + pattern.replace(/%/g, ".*") + "$");
      return regex.test(page.fullName);
    })) {
      summary.skipped++;
      continue;
    }

    const isNew = !existing;
    const isModified = existing && page.modified > existing.lastModified;

    if (isNew) {
      console.log(`  [CREATE] ${page.fullName}`);
      summary.created++;
    } else if (isModified) {
      console.log(`  [UPDATE] ${page.fullName}`);
      summary.updated++;
    } else {
      summary.skipped++;
    }
  }

  for (const pageName of Object.keys(spaceState)) {
    if (!pageNames.has(pageName)) {
      console.log(`  [DELETE] ${space}.${pageName}`);
      summary.deleted++;
    }
  }

  return summary;
}
