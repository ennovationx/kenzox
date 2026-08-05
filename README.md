# Code Companion

Master Build Prompt — AI Web Developer Platform

Paste everything below into your AI coding tool (Claude Code, Cursor, Lovable, Bolt, v0, etc.) as a single instruction. It is written so the AI can execute it directly, in order, without needing to ask clarifying questions.

ROLE

You are a senior full-stack product engineer and UI designer. Build a complete, production-grade AI web development platform (a "Lovable / v0 / Bolt" clone) called [NAME YOUR APP]. Ship working, functional code — not placeholders, not "TODO" stubs, not mock data left in production paths. Every screen must be real and connected end-to-end.

Work in phases, and after each phase, verify it builds and runs before moving to the next:

Project scaffold + design system

Auth (login/signup) + session handling

Main AI builder workspace (chat + code editor + live preview)

Settings page (account + AI customization)

Hidden /admin page

Polish pass (animations, responsiveness, dark/light mode, empty/loading/error states)

TECH STACK

Frontend: React + TypeScript + Vite

Styling: Tailwind CSS + CSS variables for theming (no hardcoded hex values in components)

State: React Context or Zustand for global state (auth, theme, AI settings)

Backend: Node.js (Express or a serverless framework) or Supabase — choose one and be consistent

Auth: real session-based or JWT auth with hashed passwords (never store plaintext passwords)

Database: Postgres (via Supabase/Prisma) for users, projects, chat history, settings

AI integration: call an LLM via a server-side route (never expose API keys client-side). Make the provider swappable — the code should call a generateCode(prompt, context) function that internally hits whichever LLM API is configured via environment variable, so it can work with any provider (Anthropic, OpenAI, etc.)

Live preview: sandboxed <iframe> using srcdoc, rebuilt on every code change

DESIGN SYSTEM (apply everywhere, no exceptions)

Visual identity: clean, modern, glassmorphic, premium SaaS feel — think frosted glass panels, soft shadows, subtle gradients, generous whitespace, rounded corners (12–20px radius). Nothing cluttered.

Glassmorphism: panels use backdrop-filter: blur(16–24px), semi-transparent backgrounds (rgba with 0.6–0.8 opacity), thin 1px borders in a low-opacity accent color, soft layered shadows.

Color system: define a CSS variable palette for both themes — background layers (base/surface/elevated), text (primary/secondary/muted), a single accent/brand color with a hover and active shade, and semantic colors (success, warning, error, info). Pick a cohesive accent (e.g. indigo/violet or teal) — not default Bootstrap blue.

Dark mode + light mode: fully implemented via a data-theme attribute or Tailwind dark: classes, toggle persists in localStorage, respects system preference on first load, and every single component (including the code editor and admin page) must support both — no component allowed to hardcode a light-only or dark-only background.

Typography: one clean sans-serif (e.g. Inter, Geist, or similar) with a clear type scale (display, h1–h3, body, small, mono for code).

Motion: smooth, physics-based transitions (150–300ms ease) on hover states, page transitions, modal open/close, tab switches, and the chat message stream (messages fade+slide in). Use a motion library (Framer Motion) rather than ad hoc CSS where interaction state is involved. Motion should feel fluid, not bouncy or distracting.

Consistency: one spacing scale, one shadow scale, one radius scale, reused everywhere via design tokens — not one-off values per component.

PAGES & ROUTES

/ — Landing page

Hero section explaining the product, feature highlights, CTA buttons to Sign Up / Log In. No functional AI here — marketing only.

/login

Email + password fields, "remember me," "forgot password" link, link to /signup.

This page must contain nothing that references or hints at admin access. No admin toggle, no role selector, no separate admin button. It is a single, ordinary login form.

On submit: authenticate against the backend. If the authenticated user's role is admin, log them in exactly the same as any other user and redirect to the normal workspace (/app) — do not auto-redirect admins to /admin. Admin access is only ever reached by an admin manually navigating to the /admin URL after logging in (see Admin section below).

/signup

Name, email, password, confirm password, basic validation (email format, password strength, matching confirmation), terms checkbox. Creates a normal (user-role) account only — there is no way to sign up as admin through this UI.

/app — Main AI builder workspace (the core product)

Three synced panels:

Chat panel (left): message history (user/AI), streaming AI responses, input box with send button, loading/"thinking" state, ability to start a new project or switch between saved projects.

Code workspace (top-right or center): tabbed file editor (HTML/CSS/JS, or a real file tree if you support multi-file projects), syntax highlighting, manual edits by the user immediately reflected.

Live preview (bottom-right or center): sandboxed iframe that re-renders instantly on every AI-generated or manually-edited code change. Include a refresh button and a "open in new tab" option.

Additional required functionality:

Save/load projects tied to the logged-in user's account.

Export/download project as a zip of files.

Responsive collapse: on smaller viewports, panels stack or become switchable tabs instead of breaking layout.

/settings

Two sections in one page (tabs or side nav):

Account: display name, email, avatar, change password, delete account (with confirmation), theme toggle (dark/light/system), logout.

AI customization: choose AI "personality"/verbosity, default coding style preferences (e.g. framework defaults, comment style), model/provider selection if multiple are configured, and a reset-to-defaults action. All settings persist to the backend per-user, not just localStorage.

/admin — Hidden admin page

Not linked from anywhere in the UI — no nav item, no button, no mention in the login page or app shell. Only reachable by typing the URL directly.

Must still be protected: on load, check the current session's role. If the logged-in user is not role: admin, redirect them to /app (or show a 404) — do not just hide it with CSS.

Admin capabilities: list of all users (search/filter, view signup date, role, status), ability to disable/delete a user, basic usage/analytics overview (e.g. number of projects, active users), and a way to promote/demote a user's role.

Visually consistent with the rest of the app's design system (dark/light mode, glassmorphism) — but it should read as a distinct "control panel," not a marketing page.

FUNCTIONAL REQUIREMENTS CHECKLIST

The AI must confirm each of these is genuinely working, not stubbed:

[ ] Signup creates a real user record with a hashed password

[ ] Login issues a real session/token and protects private routes

[ ] Logout clears the session everywhere it's stored

[ ] Chat prompt → real AI call → real generated code → live preview updates

[ ] Manual code edits update the live preview without needing an AI round-trip

[ ] Projects persist and reload correctly per user

[ ] Settings changes persist and actually affect behavior (not just visually saved)

[ ] Theme toggle works app-wide, including inside the code editor and admin page

[ ] /admin is unreachable via UI navigation and access-gated by role at the route level

[ ] All forms have real validation and real error states (not just happy-path)

[ ] Loading states exist for every async action (auth, AI generation, save/load)

[ ] Empty states exist (no projects yet, no chat history yet)

[ ] Fully responsive from mobile to desktop

NON-FUNCTIONAL REQUIREMENTS

No API keys or secrets in client-side code — all LLM calls go through a backend route.

Passwords hashed (bcrypt/argon2), never logged or returned in API responses.

Basic rate limiting on the AI generation endpoint.

Accessible: proper focus states, semantic HTML, sufficient color contrast in both themes.

Clean, componentized codebase — no single 1000-line file; split by feature/page/component.

FINAL INSTRUCTION TO THE AI

Build this as a real, runnable application, phase by phase as listed above. After each phase, briefly state what was built and that it runs without errors before continuing. Do not leave any page, button, or form non-functional. Do not add any admin-related UI element to the public login page. When finished, give a short summary of the file structure and how to run the project locally, including any environment variables required (e.g. LLM_API_KEY, DATABASE_URL). or make it by your self and make all thing in one shot and generate the logo use it in all important places

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kenzox.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3cb2d12a-cfe1-43b4-88da-00c7bd8c36b7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
