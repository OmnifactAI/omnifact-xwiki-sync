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

function isExcluded(fullName: string, exclude: string[] | undefined): boolean {
  return exclude?.some((pattern) => {
    const regex = new RegExp("^" + pattern.replace(/%/g, ".*") + "$");
    return regex.test(fullName);
  }) ?? false;
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

  const pages = await xwikiClient.listAllPages(space);
  const pageKeys = new Set(pages.map((p) => p.fullName));

  for (const page of pages) {
    if (isExcluded(page.fullName, route.exclude)) {
      summary.skipped++;
      continue;
    }

    const existing = spaceState[page.fullName];
    const isNew = !existing;
    const isModified = existing && page.modified > existing.lastModified;

    if (!isNew && !isModified) {
      summary.skipped++;
      continue;
    }

    try {
      if (isModified && existing) {
        await omnifactClient.deleteDocument(existing.omnifactDocId);
        for (const attDocId of existing.attachmentDocIds ?? []) {
          await omnifactClient.deleteDocument(attDocId);
        }
      }

      const detail = await xwikiClient.getPageContent(page.space, page.name);
      const markdown = convertToMarkdown(detail.content, detail.title || page.fullName);
      const mdBuffer = Buffer.from(markdown, "utf-8");
      const filename = `${page.fullName.replace(/\./g, "-")}.md`;

      const pageUrl = xwikiClient.getPageViewUrl(page.space, page.name);
      const doc = await omnifactClient.uploadDocument(
        route.omnifactSpaceId,
        page.fullName,
        mdBuffer,
        filename,
        { url: pageUrl }
      );

      const pageState: PageState = {
        omnifactDocId: doc.id,
        lastModified: page.modified,
        xwikiVersion: detail.version,
      };

      if (attachmentsConfig.enabled) {
        const attachments = await xwikiClient.listAttachments(page.space, page.name);
        const allowedExts = new Set(attachmentsConfig.includeTypes);
        const attDocIds: string[] = [];

        for (const att of attachments) {
          if (!allowedExts.has(getExtension(att.name))) continue;
          try {
            const attBuffer = await xwikiClient.downloadAttachment(page.space, page.name, att.name);
            const attDoc = await omnifactClient.uploadDocument(
              route.omnifactSpaceId,
              `${page.fullName} - ${att.name}`,
              attBuffer,
              att.name,
              { url: pageUrl }
            );
            attDocIds.push(attDoc.id);
          } catch (err) {
            summary.errors.push(`Attachment ${att.name} on ${page.fullName}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (attDocIds.length > 0) pageState.attachmentDocIds = attDocIds;
      }

      spaceState[page.fullName] = pageState;
      if (isNew) summary.created++;
      else summary.updated++;
    } catch (err) {
      summary.errors.push(`${page.fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const pageKey of Object.keys(spaceState)) {
    if (!pageKeys.has(pageKey)) {
      try {
        await omnifactClient.deleteDocument(spaceState[pageKey].omnifactDocId);
        for (const attDocId of spaceState[pageKey].attachmentDocIds ?? []) {
          await omnifactClient.deleteDocument(attDocId);
        }
        delete spaceState[pageKey];
        summary.deleted++;
      } catch (err) {
        summary.errors.push(`Delete ${pageKey}: ${err instanceof Error ? err.message : String(err)}`);
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

  const pages = await xwikiClient.listAllPages(space);
  const pageKeys = new Set(pages.map((p) => p.fullName));

  for (const page of pages) {
    if (isExcluded(page.fullName, route.exclude)) {
      summary.skipped++;
      continue;
    }

    const existing = spaceState[page.fullName];
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

  for (const pageKey of Object.keys(spaceState)) {
    if (!pageKeys.has(pageKey)) {
      console.log(`  [DELETE] ${pageKey}`);
      summary.deleted++;
    }
  }

  return summary;
}
