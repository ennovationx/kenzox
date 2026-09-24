# Kenzo

**Build complete web apps by chatting with AI.**

Kenzo turns natural-language prompts into fully functional, production-quality web applications. Describe what you want, attach reference screenshots, or speak it — Kenzo writes the HTML, CSS, and JavaScript in real time.

---

## ✨ Features

| Feature | Description |
|---|---|
| **AI Code Generation** | Full-stack HTML/CSS/JS apps generated from natural language via Gemini models |
| **Live Preview** | Instant in-browser preview with desktop, tablet, and mobile viewports |
| **Plan Mode** | Shape your idea before building — switch between Plan and Build modes |
| **Code Editor** | Built-in editor with syntax tabs, line numbers, and live-save |
| **Voice Input** | Record audio prompts — Kenzo transcribes and builds from speech |
| **Image Attachments** | Drop reference screenshots; the AI matches layout, colors, and mood |
| **Project Management** | Create, rename, search, and delete projects with auto-save |
| **Collaboration** | Share projects with editors or viewers, with real-time sync |
| **Notifications** | Real-time notification bell powered by Supabase Realtime |
| **Version History** | Restore any previous AI-generated version with one click |
| **Export** | Download as ZIP or single-file HTML |
| **Publish to Netlify** | One-click deploy to a live Netlify URL |
| **AI Memory** | Kenzo remembers your design preferences across sessions |
| **Admin Panel** | Manage users, roles, and AI API key rotation |
| **Dark Mode** | System-aware theme with manual override |
| **Responsive** | Fully responsive UI — works on desktop, tablet, and mobile |

---

## 🛠 Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19 + SSR)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with glassmorphism design system
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL + Row Level Security + Realtime)
- **AI**: Google Gemini models via OpenAI-compatible SDK
- **UI Components**: Radix UI primitives + shadcn/ui
- **Build Tool**: [Vite 8](https://vite.dev/)
- **Deployment**: Netlify / Cloudflare via Nitro

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ and **npm** (or Bun)
- A **Supabase** project ([create one free](https://supabase.com/dashboard))
- At least one **Gemini API key** ([get one](https://aistudio.google.com/apikey))

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

Copy the example and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
SUPABASE_PROJECT_ID="your-project-id"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_XXXXXXXXXX"
SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_XXXXXXXXXX"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-jwt"
```

### 4. Set up the database

Open the **Supabase Dashboard → SQL Editor**, then copy and run the contents of [`supabase/schema.sql`](supabase/schema.sql).

This creates all tables, functions, triggers, RLS policies, and indexes.

### 5. Enable Realtime

In Supabase Dashboard → **Database → Replication**, ensure the `notifications` table has Realtime enabled (the migration does this automatically, but verify).

### 6. Add your first AI key

1. Sign up / log in to your Kenzo instance
2. Make yourself an admin: run this in the Supabase SQL Editor, replacing `YOUR_USER_ID` with your UUID from the `auth.users` table:
   ```sql
   INSERT INTO public.user_roles (user_id, role) VALUES ('YOUR_USER_ID', 'admin');
   ```
3. Navigate to the **Admin** panel in Kenzo and add a Gemini API key

### 7. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and start building!

---

## 📁 Project Structure

```
kenzox/
├── src/
│   ├── components/        # Reusable UI components
│   ├── hooks/             # Custom React hooks
│   ├── integrations/      # Supabase client, auth middleware, types
│   ├── lib/               # Server functions (AI, admin, sharing, Netlify)
│   ├── routes/            # TanStack Router file-based routes
│   │   ├── _authenticated/ # Protected routes (app, settings, admin)
│   │   └── api/           # API routes (Netlify OAuth)
│   ├── styles.css         # Design system tokens + glassmorphism utilities
│   └── router.tsx         # Router configuration
├── supabase/
│   ├── schema.sql         # Complete database schema (run once)
│   ├── migrations/        # Incremental migration history
│   └── config.toml        # Supabase project config
├── .env.example           # Environment variable template
└── package.json
```

---

## 🔑 Environment Variables

| Variable | Side | Description |
|---|---|---|
| `SUPABASE_URL` | Server | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Both | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role key (bypasses RLS) |
| `SUPABASE_PROJECT_ID` | Both | Supabase project reference ID |
| `VITE_SUPABASE_URL` | Client | Same as `SUPABASE_URL` (Vite exposes it to the browser) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client | Same as `SUPABASE_PUBLISHABLE_KEY` |
| `VITE_SUPABASE_PROJECT_ID` | Client | Same as `SUPABASE_PROJECT_ID` |

> **Security note:** The `SUPABASE_SERVICE_ROLE_KEY` is used server-side only (in `.server.ts` files) and is never sent to the browser. Keep it secret.

---

## 🧑‍💻 Development

```bash
npm run dev        # Start dev server with HMR
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm run format     # Format with Prettier
```

---

## 📜 License

Private project — all rights reserved.
