import axios, { type AxiosInstance } from "axios";
import type { XWikiConfig } from "../config.js";
import type {
  XWikiPageSummary,
  XWikiPagesResponse,
  XWikiPageDetail,
  XWikiAttachment,
  XWikiAttachmentsResponse,
} from "./types.js";

function encodeSpacePath(space: string): string {
  return space
    .split(".")
    .map((s) => `spaces/${encodeURIComponent(s)}`)
    .join("/");
}

export class XWikiClient {
  private http: AxiosInstance;
  private wiki: string;
  private baseUrl: string;

  constructor(config: XWikiConfig, debug = false) {
    this.wiki = config.wiki;
    this.baseUrl = config.baseUrl;
    this.http = axios.create({
      baseURL: `${config.baseUrl}/rest/wikis/${config.wiki}`,
      auth: { username: config.username, password: config.password },
      headers: { Accept: "application/json" },
    });
    if (debug) {
      this.http.interceptors.request.use((req) => {
        const base = (req.baseURL ?? "").replace(/\/$/, "");
        const url = new URL(base + (req.url ?? ""));
        if (req.params) {
          Object.entries(req.params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        }
        console.debug(`[XWiki] ${req.method?.toUpperCase()} ${url}`);
        return req;
      });
      this.http.interceptors.response.use((res) => {
        console.debug(`[XWiki] ${res.status} ${res.config.url} — keys: ${Object.keys(res.data).join(", ")}`);
        console.debug(`[XWiki] body:`, JSON.stringify(res.data).slice(0, 1000));
        return res;
      });
    }
  }

  getPageViewUrl(space: string, pageName: string): string {
    const spacePath = space.split(".").map(encodeURIComponent).join("/");
    return `${this.baseUrl}/bin/view/${spacePath}/${encodeURIComponent(pageName)}`;
  }

  private async fetchPagesAt(encodedPath: string): Promise<XWikiPageSummary[]> {
    const pages: XWikiPageSummary[] = [];
    let start = 0;
    const limit = 100;
    while (true) {
      const res = await this.http.get<XWikiPagesResponse>(
        `/${encodedPath}/pages`,
        { params: { start, number: limit } }
      );
      const batch = res.data.pageSummaries || [];
      pages.push(...batch);
      if (batch.length < limit) break;
      start += limit;
    }
    return pages;
  }

  private async fetchChildrenAt(encodedPath: string, pageName: string): Promise<XWikiPageSummary[]> {
    const children: XWikiPageSummary[] = [];
    let start = 0;
    const limit = 100;
    while (true) {
      const res = await this.http.get<XWikiPagesResponse>(
        `/${encodedPath}/pages/${encodeURIComponent(pageName)}/children`,
        { params: { start, number: limit } }
      );
      const batch = res.data.pageSummaries || [];
      children.push(...batch);
      if (batch.length < limit) break;
      start += limit;
    }
    return children;
  }

  async listAllPages(rootSpace: string): Promise<XWikiPageSummary[]> {
    const visited = new Set<string>();

    const recurse = async (dotSpace: string, encodedPath: string): Promise<XWikiPageSummary[]> => {
      if (visited.has(dotSpace)) return [];
      visited.add(dotSpace);

      const pages = await this.fetchPagesAt(encodedPath);
      for (const p of pages) {
        p.space = dotSpace;
        p.fullName = `${dotSpace}.${p.name}`;
      }

      // Discover nested spaces via children of each page in this space
      const nestedSpaces = new Map<string, string>(); // dotSpace -> encodedPath
      for (const page of pages) {
        const children = await this.fetchChildrenAt(encodedPath, page.name);
        for (const child of children) {
          const childSpace = child.space || child.fullName?.slice(0, child.fullName.lastIndexOf("."));
          if (childSpace && childSpace !== dotSpace && !visited.has(childSpace) && !nestedSpaces.has(childSpace)) {
            nestedSpaces.set(childSpace, encodeSpacePath(childSpace));
          }
        }
      }

      const nested: XWikiPageSummary[] = [];
      for (const [nestedDot, nestedEncoded] of nestedSpaces) {
        nested.push(...await recurse(nestedDot, nestedEncoded));
      }

      return [...pages, ...nested];
    };

    return recurse(rootSpace, encodeSpacePath(rootSpace));
  }

  async getPageContent(space: string, pageName: string): Promise<XWikiPageDetail> {
    const spacePath = encodeSpacePath(space);
    const res = await this.http.get<XWikiPageDetail>(
      `/${spacePath}/pages/${encodeURIComponent(pageName)}`,
      { params: { media: "json" } }
    );
    return res.data;
  }

  async listAttachments(space: string, pageName: string): Promise<XWikiAttachment[]> {
    const spacePath = encodeSpacePath(space);
    const res = await this.http.get<XWikiAttachmentsResponse>(
      `/${spacePath}/pages/${encodeURIComponent(pageName)}/attachments`
    );
    return res.data.attachments || [];
  }

  async downloadAttachment(
    space: string,
    pageName: string,
    filename: string
  ): Promise<Buffer> {
    const spacePath = encodeSpacePath(space);
    const res = await this.http.get(
      `/${spacePath}/pages/${encodeURIComponent(pageName)}/attachments/${encodeURIComponent(filename)}`,
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data);
  }
}
