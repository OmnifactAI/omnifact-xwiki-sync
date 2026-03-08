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

  constructor(config: XWikiConfig) {
    this.wiki = config.wiki;
    this.baseUrl = config.baseUrl;
    this.http = axios.create({
      baseURL: `${config.baseUrl}/rest/wikis/${config.wiki}`,
      auth: { username: config.username, password: config.password },
      headers: { Accept: "application/json" },
    });
  }

  getPageViewUrl(space: string, pageName: string): string {
    const spacePath = space.split(".").map(encodeURIComponent).join("/");
    return `${this.baseUrl}/bin/view/${spacePath}/${encodeURIComponent(pageName)}`;
  }

  async listPages(space: string): Promise<XWikiPageSummary[]> {
    const spacePath = encodeSpacePath(space);
    const pages: XWikiPageSummary[] = [];
    let start = 0;
    const limit = 100;

    while (true) {
      const res = await this.http.get<XWikiPagesResponse>(
        `/${spacePath}/pages`,
        { params: { start, number: limit } }
      );
      const batch = res.data.pageSummaries || [];
      pages.push(...batch);
      if (batch.length < limit) break;
      start += limit;
    }

    return pages;
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
