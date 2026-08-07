ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS assets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS feedback text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'build';

CREATE TABLE IF NOT EXISTS public.project_shares (
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

CREATE TABLE IF NOT EXISTS public.notifications (
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

CREATE TABLE IF NOT EXISTS public.user_memory (
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

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_email ON public.project_shares(lower(invited_email));