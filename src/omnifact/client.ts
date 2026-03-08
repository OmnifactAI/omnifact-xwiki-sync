import axios, { type AxiosInstance } from "axios";
import type { OmnifactConfig } from "../config.js";
import type { OmnifactDocument } from "./types.js";

export class OmnifactClient {
  private http: AxiosInstance;

  constructor(config: OmnifactConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        "X-API-Key": config.apiKey,
      },
    });
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
      new Blob([new Uint8Array(content)]),
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
    await this.http.delete(`/v1/documents/${encodeURIComponent(docId)}`);
  }
}
