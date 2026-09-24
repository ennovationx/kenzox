import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function tokenFor(userId: string): Promise<string> {
  const { decryptToken, GithubError } = await import("./github.server");
  const db = await admin();
  const { data } = await db.from("github_connections").select("access_token").eq("user_id", userId).maybeSingle();
  if (!data) throw new GithubError("Connect your GitHub account first.", 401);
  return decryptToken(data.access_token as string);
}

function generateProjectReadme(projectName: string, description?: string): string {
  return `# ${projectName || "Kenzo Web Application"}

> ${description || "A modern web application designed and generated with Kenzo AI."}

---

## 🚀 Live Preview
Run this project locally or deploy it to your preferred hosting provider (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

## 🛠 Tech Stack
- **HTML5**: Semantic and accessible markup
- **CSS3**: Custom design system, responsive layout, fluid typography, and glassmorphism accents
- **Vanilla JavaScript**: Lightweight, modern, zero-dependency interactive functionality
- **Icons**: Google Material Symbols

## 📁 Project Structure
\`\`\`
├── index.html       # Application entrypoint & markup
├── styles.css       # Complete stylesheet, CSS variables, & responsive breakpoints
├── script.js        # Core logic, UI events, and interactions
└── README.md        # Project documentation
\`\`\`

## 🏃 Running Locally
1. Clone or download this repository:
   \`\`\`bash
   git clone https://github.com/<owner>/<repo>.git
   \`\`\`
2. Open \`index.html\` directly in any modern browser, or run a local server:
   \`\`\`bash
   npx serve .
   \`\`\`

---

*Generated with [Kenzo](https://kenzox.vercel.app) — Built by Eserom Demisew.*
`;
}

/* ------------------------------- connection -------------------------------- */

export const getGithubConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("github_connections")
      .select("github_username, account_name, avatar_url, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!data) return { connected: false as const };
    return {
      connected: true as const,
      username: (data.github_username as string) ?? "GitHub User",
      accountName: (data.account_name as string | null) ?? null,
      avatarUrl: (data.avatar_url as string | null) ?? null,
      connectedAt: data.created_at as string,
    };
  });

export const startGithubOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const clientId = process.env["GITHUB_CLIENT_ID"];
    if (!clientId) throw new Error("GitHub OAuth is not configured on this server.");
    const state = crypto.randomUUID();
    const db = await admin();
    await db.from("github_oauth_states").insert({ state, user_id: context.userId });

    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/github/callback`;
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", "repo,read:user");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return { url: url.toString(), redirectUri };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    await db.from("github_connections").delete().eq("user_id", context.userId);
    return { connected: false };
  });

export const getGithubRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await tokenFor(context.userId);
    const { listUserRepos } = await import("./github.server");
    const repos = await listUserRepos(token);
    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      htmlUrl: r.html_url,
      updatedAt: r.updated_at,
    }));
  });

/* --------------------------------- export to github --------------------------------- */

export const pushProjectToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: unknown) =>
      z
        .object({
          projectId: z.string().uuid(),
          repoName: z.string().min(1).max(100),
          isNew: z.boolean().default(true),
          isPrivate: z.boolean().default(false),
          description: z.string().max(300).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await tokenFor(context.userId);
    const db = await admin();

    const { data: project } = await db
      .from("projects")
      .select("id, name, files, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (!project) throw new Error("Project not found");
    if (project.user_id !== context.userId) throw new Error("Only the owner can push to GitHub.");

    const { getGithubUser, createRepo, commitFiles } = await import("./github.server");
    const ghUser = await getGithubUser(token);

    let targetOwner = ghUser.login;
    let targetRepoName = data.repoName.trim().replace(/\s+/g, "-");

    if (data.isNew) {
      try {
        const created = await createRepo(token, {
          name: targetRepoName,
          description: data.description || `${project.name} — built with Kenzo AI`,
          isPrivate: data.isPrivate,
          autoInit: true,
        });
        targetRepoName = created.name;
      } catch (err: any) {
        // If repo already exists, continue with that repo
        if (!err.message?.includes("already exists")) {
          throw err;
        }
      }
    }

    const files = (project.files as Record<string, string>) ?? {};
    const readmeContent = generateProjectReadme(project.name, data.description);

    const payloadFiles: Record<string, string> = {
      "index.html": files["index.html"] ?? "<!doctype html><html><body><h1>Kenzo App</h1></body></html>",
      "styles.css": files["styles.css"] ?? "body { font-family: sans-serif; }",
      "script.js": files["script.js"] ?? "console.log('Kenzo App');",
      "README.md": readmeContent,
    };

    const res = await commitFiles(token, {
      owner: targetOwner,
      repo: targetRepoName,
      message: `Update ${project.name} via Kenzo AI`,
      files: payloadFiles,
    });

    await db.from("notifications").insert({
      user_id: context.userId,
      type: "github",
      title: "Pushed to GitHub",
      body: `Successfully pushed "${project.name}" to GitHub: ${res.htmlUrl}`,
    });

    return {
      success: true,
      repoUrl: res.htmlUrl,
      repoFullName: `${targetOwner}/${targetRepoName}`,
    };
  });
