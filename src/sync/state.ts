import { readFileSync, writeFileSync, existsSync } from "node:fs";

export interface PageState {
  omnifactDocId: string;
  lastModified: string;
  xwikiVersion: string;
  attachmentDocIds?: string[];
}

export interface SyncState {
  [space: string]: {
    [pageName: string]: PageState;
  };
}

export function loadState(filePath: string): SyncState {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SyncState;
}

export function saveState(filePath: string, state: SyncState): void {
  writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
}
