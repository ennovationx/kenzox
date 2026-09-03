/** Server-only Netlify helpers. Tokens are encrypted at rest and never leave the server. */

const API = "https://api.netlify.com/api/v1";

export class NetlifyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* ---------------------------------- crypto --------------------------------- */

async function aesKey(): Promise<CryptoKey> {
  const secret = process.env["NETLIFY_TOKEN_ENC_KEY"];
  if (!secret) throw new Error("Missing NETLIFY_TOKEN_ENC_KEY");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey();
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return `v1.${b64(iv)}.${b64(new Uint8Array(buf))}`;
}

export async function decryptToken(stored: string): Promise<string> {
  const [version, ivPart, dataPart] = stored.split(".");
  if (version !== "v1" || !ivPart || !dataPart) throw new NetlifyError("Stored Netlify token is unreadable. Reconnect your account.", 401);
  const key = await aesKey();
  try {
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivPart) }, key, unb64(dataPart));
    return new TextDecoder().decode(buf);
  } catch {
    throw new NetlifyError("Stored Netlify token could not be decrypted. Reconnect your account.", 401);
  }
}

/* ----------------------------------- api ----------------------------------- */

type Json = Record<string, unknown>;

export async function netlifyFetch<T = Json>(
  token: string,
  path: string,
  init: { method?: string; body?: BodyInit | null; contentType?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": init.contentType ?? "application/json" } : {}),
      },
      body: init.body ?? null,
    });
  } catch {
    throw new NetlifyError("Could not reach Netlify. Check your connection and try again.", 503);
  }

  if (res.status === 204) return {} as T;
  const text = await res.text();

  if (!res.ok) {
    if (res.status === 401) throw new NetlifyError("Your Netlify connection is no longer valid. Reconnect your account.", 401);
    if (res.status === 403) throw new NetlifyError("Netlify denied this action — your plan or account permissions do not allow it.", 403);
    if (res.status === 429) throw new NetlifyError("Netlify rate limit reached. Wait a minute and try again.", 429);
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { message?: string; errors?: Record<string, string[]> };
      if (parsed.errors) detail = Object.entries(parsed.errors).map(([k, v]) => `${k} ${v.join(", ")}`).join("; ");
      else if (parsed.message) detail = parsed.message;
    } catch { /* keep raw */ }
    throw new NetlifyError(detail || `Netlify request failed (${res.status})`, res.status);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export async function sha1Hex(content: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function slugifyName(name: string): string {
  const base = (name || "kenzo-app")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "kenzo-app";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

/** Total payload guard (Netlify accepts far more, but keep failures loud not silent). */
export const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

export type DeployFiles = Record<string, string>;

export type NetlifyDeploy = {
  id: string;
  state: string;
  ssl_url?: string;
  url?: string;
  error_message?: string | null;
  created_at?: string;
  required?: string[];
};

/** Digest deploy: declare hashes, upload only what Netlify asks for, then poll. */
export async function deployFiles(token: string, siteId: string, files: DeployFiles): Promise<NetlifyDeploy> {
  const encoder = new TextEncoder();
  let total = 0;
  const digest: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    total += encoder.encode(content).byteLength;
    digest[path] = await sha1Hex(content);
  }
  if (total > MAX_PAYLOAD_BYTES) {
    throw new NetlifyError(`Project is too large to publish (${(total / 1048576).toFixed(1)} MB, limit 25 MB).`, 413);
  }

  const deploy = await netlifyFetch<NetlifyDeploy>(token, `/sites/${siteId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ files: digest }),
  });

  const required = new Set(deploy.required ?? []);
  for (const [path, content] of Object.entries(files)) {
    if (required.size && !required.has(digest[path]!)) continue;
    await netlifyFetch(token, `/deploys/${deploy.id}/files${path}`, {
      method: "PUT",
      body: content,
      contentType: "application/octet-stream",
    });
  }

  return pollDeploy(token, deploy.id);
}

export async function pollDeploy(token: string, deployId: string, attempts = 20): Promise<NetlifyDeploy> {
  let last: NetlifyDeploy | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await netlifyFetch<NetlifyDeploy>(token, `/deploys/${deployId}`);
    if (last.state === "ready" || last.state === "error") return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last ?? { id: deployId, state: "building" };
}
