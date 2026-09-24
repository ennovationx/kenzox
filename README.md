# Kenzo

**Build complete web apps by chatting with AI.**

Kenzo turns natural-language prompts into fully functional, production-quality web applications. Describe what you want, attach reference screenshots, or speak it — Kenzo writes the HTML, CSS, and JavaScript in real time.

---

## ✨ Features

| Feature | Description |
|---|---|
| **AI Code Generation** | Full-stack HTML/CSS/JS apps generated from natural language via Gemini models |
| **Bring Your Own Key (BYOK)** | Add personal Gemini API keys in Settings with direct Google AI Studio integration |
| **Daily Giveaway Prompts** | 3 free daily prompts per user from server key pool (auto-resets every 24h) |
| **GitHub Integration** | 1-click OAuth connect and push project files + auto-generated README directly to GitHub |
| **Live Preview** | Instant in-browser preview with desktop, tablet, and mobile viewports |
| **Responsive Mobile UI** | Seamlessly switch between dedicated `[Chat]` and `[Preview]` tabs on mobile & tablets |
| **Image Pasting & Viewer** | Paste images directly (`Ctrl+V`) into composer and click any thumbnail for full-screen inspection |
| **Fix with AI (Console)** | 1-click action on runtime error lines to automatically draft fix prompts for the AI |
| **Plan Mode** | Shape your idea before building — switch between Plan and Build modes |
| **Code Editor** | Built-in editor with syntax tabs, line numbers, and live-save |
| **Voice Input** | Record audio prompts — Kenzo transcribes and builds from speech |
| **Project Management** | Create, rename, search, and delete projects with auto-save and draft memory |
| **Collaboration** | Share projects with editors or viewers, with real-time sync |
| **Notifications** | Real-time notification bell with persistent read tracking powered by Supabase |
| **Version History** | Restore any previous AI-generated version with one click |
| **Export** | Download as ZIP or single-file HTML |
| **Publish to Netlify** | One-click deploy to a live Netlify URL |
| **AI Memory** | Kenzo remembers your design preferences across sessions |
| **Admin Panel** | Manage users, roles, and AI API key rotation |
| **Dark Mode** | System-aware theme with manual override |

---

## 🛠 Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19 + SSR)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with custom glassmorphism design system
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL + Row Level Security + Realtime)
- **AI**: Google Gemini models via OpenAI-compatible SDK + BYOK Key Resolution
- **UI Components**: Radix UI primitives + Lucide Icons
- **Build Tool**: [Vite 8](https://vite.dev/)
- **Deployment**: Vercel / Netlify / Cloudflare via Nitro

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ and **npm**
- A **Supabase** project ([create one free](https://supabase.com/dashboard))
- A free **Gemini API key** ([get one free from Google AI Studio](https://aistudio.google.com/apikey))

### 1. Clone the repository

```bash
git clone https://github.com/ennovationx/kenzox.git
cd kenzox
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example and fill in your Supabase and OAuth credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Supabase
SUPABASE_PROJECT_ID="your-project-id"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_XXXXXXXXXX"
SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_XXXXXXXXXX"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-jwt"

# Netlify OAuth (optional, for 1-click deployments)
NETLIFY_CLIENT_ID="your-netlify-client-id"
NETLIFY_CLIENT_SECRET="your-netlify-client-secret"
NETLIFY_TOKEN_ENC_KEY="any-random-32-char-string-for-token-encryption"

# GitHub OAuth (optional, for GitHub repository pushing)
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# App URL
APP_URL="https://kenzox.vercel.app"
VITE_APP_URL="https://kenzox.vercel.app"
```

### 4. Set up the database

Open the **Supabase Dashboard → SQL Editor**, then copy and run the contents of [`supabase/schema.sql`](supabase/schema.sql).

This sets up:
- Core tables (`projects`, `chat_messages`, `profiles`, `user_roles`)
- Collaborations (`project_shares`, `project_invites`, `notifications`)
- Personal keys & usage quotas (`user_api_keys`, `daily_prompt_usage`)
- OAuth connections (`github_connections`, `netlify_connections`)
- Row Level Security (RLS) policies and triggers

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and start building!

---

## 🔑 Environment Variables Reference

| Variable | Side | Description |
|---|---|---|
| `SUPABASE_URL` | Server | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Both | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role key (bypasses RLS) |
| `SUPABASE_PROJECT_ID` | Both | Supabase project reference ID |
| `VITE_SUPABASE_URL` | Client | Same as `SUPABASE_URL` (exposed to browser) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client | Same as `SUPABASE_PUBLISHABLE_KEY` |
| `VITE_SUPABASE_PROJECT_ID` | Client | Same as `SUPABASE_PROJECT_ID` |
| `NETLIFY_CLIENT_ID` | Server | Netlify OAuth Application Client ID |
| `NETLIFY_CLIENT_SECRET` | Server | Netlify OAuth Application Secret |
| `NETLIFY_TOKEN_ENC_KEY` | Server | 32-character AES secret key for encrypting stored access tokens |
| `GITHUB_CLIENT_ID` | Server | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Server | GitHub OAuth App Client Secret |
| `APP_URL` / `VITE_APP_URL` | Both | Production URL for OAuth callback redirects |

> **Security note:** The `SUPABASE_SERVICE_ROLE_KEY`, `NETLIFY_CLIENT_SECRET`, and `GITHUB_CLIENT_SECRET` are used strictly server-side and never exposed to the client.

---

## 👨‍💻 Developer & Creator

Kenzo was created and developed by **Eserom Demisew**.
Visit the developer portfolio and discover more projects at [https://eserom.vercel.app](https://eserom.vercel.app).

---

## 📜 License

Private project — all rights reserved. © 2026 Kenzo AI.
