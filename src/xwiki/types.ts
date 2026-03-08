export interface XWikiLink {
  href: string;
  rel: string;
  type?: string;
}

export interface XWikiPageSummary {
  id: string;
  name: string;
  fullName: string;
  wiki: string;
  space: string;
  modified: string;
  links: XWikiLink[];
}

export interface XWikiPagesResponse {
  pageSummaries: XWikiPageSummary[];
}

export interface XWikiPageDetail {
  id: string;
  name: string;
  fullName: string;
  wiki: string;
  space: string;
  title: string;
  content: string;
  modified: string;
  version: string;
  links: XWikiLink[];
}

export interface XWikiAttachment {
  name: string;
  size: number;
  mimeType: string;
  links: XWikiLink[];
}

export interface XWikiAttachmentsResponse {
  attachments: XWikiAttachment[];
}
