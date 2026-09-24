/** Server-only GitHub helpers. Tokens are encrypted at rest and never leave the server. */

const API = "https://api.github.com";

export class GithubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* ---------------------------------- crypto --------------------------------- */

async function aesKey(): Promise<CryptoKey> {
  const secret = process.env["NETLIFY_TOKEN_ENC_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"] || "kenzo-secret-encryption-fallback-key-32";
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
  if (version !== "v1" || !ivPart || !dataPart) throw new GithubError("Stored GitHub token is unreadable. Reconnect your account.", 401);
  const key = await aesKey();
  try {
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivPart) }, key, unb64(dataPart));
    return new TextDecoder().decode(buf);
  } catch {
    throw new GithubError("Stored GitHub token could not be decrypted. Reconnect your account.", 401);
  }
}

/* ----------------------------------- api ----------------------------------- */

type Json = Record<string, unknown>;

export async function githubFetch<T = Json>(
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
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Kenzo-AI-App",
        ...(init.body ? { "Content-Type": init.contentType ?? "application/json" } : {}),
      },
      body: init.body ?? null,
    });
  } catch {
    throw new GithubError("Could not connect to GitHub. Please check your network and try again.", 503);
  }

  if (res.status === 204) return {} as T;
  const text = await res.text();

  if (!res.ok) {
    if (res.status === 401) throw new GithubError("Your GitHub connection expired. Reconnect your account.", 401);
    if (res.status === 403) throw new GithubError("GitHub permission denied. Check your repository permissions.", 403);
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) detail = parsed.message;
    } catch {}
    throw new GithubError(detail || `GitHub request failed (${res.status})`, res.status);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export type GithubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
  html_url: string;
};

export async function getGithubUser(token: string): Promise<GithubUser> {
  return githubFetch<GithubUser>(token, "/user");
}

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  updated_at: string;
};

export async function listUserRepos(token: string): Promise<GithubRepo[]> {
  return githubFetch<GithubRepo[]>(token, "/user/repos?per_page=100&sort=updated");
}

export async function createRepo(
  token: string,
  opts: { name: string; description?: string; isPrivate?: boolean; autoInit?: boolean },
): Promise<GithubRepo> {
  return githubFetch<GithubRepo>(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      description: opts.description ?? "Built with Kenzo AI",
      private: opts.isPrivate ?? false,
      auto_init: opts.autoInit ?? true,
    }),
  });
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Pushes or updates files in a GitHub repo via contents API */
export async function commitFiles(
  token: string,
  opts: {
    owner: string;
    repo: string;
    branch?: string;
    message: string;
    files: Record<string, string>;
  },
): Promise<{ commitSha?: string; htmlUrl: string }> {
  const branch = opts.branch ?? "main";

  for (const [path, content] of Object.entries(opts.files)) {
    const cleanPath = path.replace(/^\/+/, "");
    // Check if file exists to provide sha for update
    let sha: string | undefined;
    try {
      const existing = await githubFetch<{ sha?: string }>(
        token,
        `/repos/${opts.owner}/${opts.repo}/contents/${cleanPath}?ref=${branch}`,
      );
      sha = existing.sha;
    } catch {
      // file does not exist yet, that's fine
    }

    await githubFetch(token, `/repos/${opts.owner}/${opts.repo}/contents/${cleanPath}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `${opts.message} (${cleanPath})`,
        content: toBase64Utf8(content),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  return {
    htmlUrl: `https://github.com/${opts.owner}/${opts.repo}`,
  };
}
