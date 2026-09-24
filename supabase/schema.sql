-- =============================================================================
-- Kenzo — Full database schema
-- Run this ONCE in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ▸ 1. Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ▸ 2. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active',
  ai_personality text NOT NULL DEFAULT 'balanced',
  ai_verbosity text NOT NULL DEFAULT 'normal',
  ai_style text NOT NULL DEFAULT 'modern',
  ai_model text NOT NULL DEFAULT 'openai/gpt-5.4',
  theme text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own profile" ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "admins read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update all profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete profiles" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ▸ 3. Projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled project',
  files jsonb NOT NULL DEFAULT '{"index.html":"<!doctype html><html><head><meta charset=\"utf-8\"><title>New app</title></head><body><h1>Hello from Kenzo</h1></body></html>","styles.css":"body{font-family:system-ui;padding:2rem}","script.js":"console.log(\"Kenzo\")"}'::jsonb,
  is_draft boolean NOT NULL DEFAULT false,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  netlify_site_id text,
  netlify_site_name text,
  netlify_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own projects" ON public.projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ▸ 4. Chat messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  snapshot jsonb,
  feedback text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  mode text NOT NULL DEFAULT 'build',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_project_idx ON public.chat_messages(project_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own messages" ON public.chat_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ▸ 5. Triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ▸ 6. New user handler: create profile + default 'user' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ▸ 7. Security: revoke public access to sensitive functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- ▸ 8. Project shares + collaboration
CREATE TABLE public.project_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, invited_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_shares TO authenticated;
GRANT ALL ON public.project_shares TO service_role;
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.share_role(_project_id uuid, _user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.role FROM public.project_shares s
  JOIN auth.users u ON u.id = _user_id
  WHERE s.project_id = _project_id
    AND (s.user_id = _user_id OR lower(s.invited_email) = lower(u.email))
  ORDER BY CASE WHEN s.role = 'editor' THEN 0 ELSE 1 END
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.share_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_role(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.owns_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id)
$$;
REVOKE ALL ON FUNCTION public.owns_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_project(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.owns_project(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.share_role(uuid, uuid) FROM anon;

CREATE POLICY "owners manage shares" ON public.project_shares FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "collaborators read shares" ON public.project_shares FOR SELECT TO authenticated
  USING (public.share_role(project_id, auth.uid()) IS NOT NULL);

CREATE POLICY "collaborators read projects" ON public.projects FOR SELECT TO authenticated
  USING (public.share_role(id, auth.uid()) IS NOT NULL);
CREATE POLICY "editors update projects" ON public.projects FOR UPDATE TO authenticated
  USING (public.share_role(id, auth.uid()) = 'editor')
  WITH CHECK (public.share_role(id, auth.uid()) = 'editor');

CREATE POLICY "collaborators read messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.share_role(project_id, auth.uid()) IS NOT NULL);
CREATE POLICY "editors write messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.share_role(project_id, auth.uid()) = 'editor');

-- ▸ 9. Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ▸ 10. User memory (long-term AI preferences)
CREATE TABLE public.user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_memory TO authenticated;
GRANT ALL ON public.user_memory TO service_role;
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own memory" ON public.user_memory FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ▸ 11. AI API keys (admin-only, service role access)
CREATE TABLE public.ai_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  api_key text NOT NULL,
  priority integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  exhausted_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_api_keys TO authenticated;
GRANT ALL ON public.ai_api_keys TO service_role;
ALTER TABLE public.ai_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view AI API keys"
ON public.ai_api_keys FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ai_api_keys_updated BEFORE UPDATE ON public.ai_api_keys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ▸ 12. Netlify integration
CREATE TABLE public.netlify_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  account_name TEXT,
  account_email TEXT,
  account_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.netlify_connections TO authenticated;
GRANT ALL ON public.netlify_connections TO service_role;
ALTER TABLE public.netlify_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Netlify connection"
ON public.netlify_connections FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TABLE public.netlify_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.netlify_oauth_states TO service_role;
ALTER TABLE public.netlify_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "OAuth states are service-role only"
ON public.netlify_oauth_states FOR ALL TO authenticated
USING (false) WITH CHECK (false);

-- ▸ 13. Project deploys
CREATE TABLE public.project_deploys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deploy_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'building',
  url TEXT,
  error_message TEXT,
  kind TEXT NOT NULL DEFAULT 'publish',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_deploys_project_idx ON public.project_deploys (project_id, created_at DESC);
GRANT SELECT ON public.project_deploys TO authenticated;
GRANT ALL ON public.project_deploys TO service_role;
ALTER TABLE public.project_deploys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view deploys"
ON public.project_deploys FOR SELECT TO authenticated
USING (
  public.owns_project(project_id, auth.uid())
  OR public.share_role(project_id, auth.uid()) IS NOT NULL
);

-- ▸ 14. Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_email ON public.project_shares(lower(invited_email));

-- ▸ 15. Enable Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ▸ 16. User API Keys (BYOK - Bring Your Own Key)
CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'My Gemini API Key',
  api_key text NOT NULL,
  priority integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  exhausted_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_api_keys TO authenticated;
GRANT ALL ON public.user_api_keys TO service_role;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own api keys" ON public.user_api_keys FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_api_keys_updated BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ▸ 17. Daily Prompt Usage (3 giveaway prompts/day from admin pool for non-admins)
CREATE TABLE public.daily_prompt_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  prompt_count integer NOT NULL DEFAULT 0,
  last_prompt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);
GRANT SELECT, INSERT, UPDATE ON public.daily_prompt_usage TO authenticated;
GRANT ALL ON public.daily_prompt_usage TO service_role;
ALTER TABLE public.daily_prompt_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own daily usage" ON public.daily_prompt_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ▸ 18. GitHub Integration
CREATE TABLE public.github_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  github_username text,
  account_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.github_connections TO authenticated;
GRANT ALL ON public.github_connections TO service_role;
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own github connection" ON public.github_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.github_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.github_oauth_states TO service_role;
ALTER TABLE public.github_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "github oauth states service role only" ON public.github_oauth_states FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
