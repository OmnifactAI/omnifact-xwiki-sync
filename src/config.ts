import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import dotenv from "dotenv";
import { SUPPORTED_EXTENSIONS } from "./omnifact/client.js";

dotenv.config();

export interface XWikiConfig {
  baseUrl: string;
  username: string;
  password: string;
  wiki: string;
}

export interface OmnifactConfig {
  apiKey: string;
  baseUrl: string;
}

export interface Route {
  xwikiSpace: string;
  omnifactSpaceId: string;
  exclude?: string[];
}

export interface AttachmentsConfig {
  enabled: boolean;
  includeTypes: string[];
}

export interface SyncConfig {
  stateFile: string;
}

export interface Config {
  xwiki: XWikiConfig;
  omnifact: OmnifactConfig;
  routes: Route[];
  sync: SyncConfig;
  attachments: AttachmentsConfig;
}

function substituteEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
    const envVal = process.env[varName];
    if (envVal === undefined) {
      throw new Error(`Environment variable ${varName} is not set`);
    }
    return envVal;
  });
}

function substituteDeep(obj: unknown): unknown {
  if (typeof obj === "string") {
    return substituteEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteDeep);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = substituteDeep(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, "utf-8");
  const parsed = yaml.load(raw);
  const config = substituteDeep(parsed) as Config;

  if (!config.xwiki?.baseUrl) throw new Error("xwiki.baseUrl is required");
  if (!config.xwiki?.username) throw new Error("xwiki.username is required");
  if (!config.xwiki?.password) throw new Error("xwiki.password is required");
  if (!config.omnifact?.apiKey) throw new Error("omnifact.apiKey is required");
  if (!config.omnifact?.baseUrl) throw new Error("omnifact.baseUrl is required");
  if (!config.routes?.length) throw new Error("At least one route is required");

  config.xwiki.wiki = config.xwiki.wiki || "xwiki";
  config.sync = config.sync || { stateFile: ".sync-state.json" };
  config.sync.stateFile = config.sync.stateFile || ".sync-state.json";
  config.attachments = config.attachments || { enabled: false, includeTypes: [] };

  const includeTypes = (config.attachments.includeTypes || []).map((t) => t.toLowerCase());
  const unsupported = includeTypes.filter((t) => !SUPPORTED_EXTENSIONS.has(t));
  if (unsupported.length > 0) {
    console.warn(
      `Warning: attachments.includeTypes contains file types not supported by Omnifact, ignoring: ${unsupported.join(", ")}\n` +
        `Supported types: ${[...SUPPORTED_EXTENSIONS].join(", ")}`
    );
  }
  config.attachments.includeTypes = includeTypes.filter((t) => SUPPORTED_EXTENSIONS.has(t));

  return config;
}
