import axios, { isAxiosError, type AxiosInstance } from "axios";
import type { OmnifactConfig } from "../config.js";
import type { OmnifactDocument } from "./types.js";

const MIME_TYPES: Record<string, string> = {
  txt: "text/plain",
  json: "application/json",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  dot: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  odt: "application/vnd.oasis.opendocument.text",
  ott: "application/vnd.oasis.opendocument.text-template",
  ppt: "application/vnd.ms-powerpoint",
  pot: "application/vnd.ms-powerpoint",
  pps: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
  odp: "application/vnd.oasis.opendocument.presentation",
  otp: "application/vnd.oasis.opendocument.presentation-template",
};

export const SUPPORTED_EXTENSIONS = new Set(Object.keys(MIME_TYPES));

function mimeTypeForFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export class OmnifactClient {
  private http: AxiosInstance;

  constructor(config: OmnifactConfig, debug = false) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        "X-API-Key": config.apiKey,
      },
    });
    if (debug) {
      this.http.interceptors.request.use((req) => {
        const base = (req.baseURL ?? "").replace(/\/$/, "");
        const url = new URL(base + (req.url ?? ""));
        console.debug(`[Omnifact] ${req.method?.toUpperCase()} ${url}`);
        return req;
      });
      this.http.interceptors.response.use(
        (res) => res,
        (err) => {
          if (isAxiosError(err) && err.response) {
            const req = err.config;
            const res = err.response;
            const base = (req?.baseURL ?? "").replace(/\/$/, "");
            const url = base + (req?.url ?? "");
            console.debug(`[Omnifact] Error ${res.status} on ${req?.method?.toUpperCase()} ${url}`);
            if (req?.data instanceof FormData) {
              const obj: Record<string, string> = {};
              (req.data as FormData).forEach((v, k) => {
                obj[k] = v instanceof Blob ? `<Blob ${v.size}b>` : String(v);
              });
              console.debug("[Omnifact] Request body:", JSON.stringify(obj, null, 2));
            }
            console.debug("[Omnifact] Response body:", JSON.stringify(res.data, null, 2));
          }
          return Promise.reject(err);
        }
      );
    }
  }

  async uploadDocument(
    spaceId: string,
    name: string,
    content: Buffer,
    filename: string,
    metadata?: Record<string, unknown>
  ): Promise<OmnifactDocument> {
    const form = new FormData();
    form.append("name", name);
    form.append(
      "file",
      new Blob([new Uint8Array(content)], { type: mimeTypeForFilename(filename) }),
      filename
    );
    if (metadata) {
      form.append("metadata", JSON.stringify(metadata));
    }

    const res = await this.http.post<OmnifactDocument>(
      `/v1/documents?spaceId=${encodeURIComponent(spaceId)}`,
      form
    );
    return res.data;
  }

  async deleteDocument(docId: string): Promise<void> {
    try {
      await this.http.delete(`/v1/documents/${encodeURIComponent(docId)}`);
    } catch (err) {
      // Already gone (e.g. a previous run deleted it but failed before
      // re-uploading) — treat as success so the page isn't stuck in an
      // error loop forever.
      if (isAxiosError(err) && err.response?.status === 404) return;
      throw err;
    }
  }
}
