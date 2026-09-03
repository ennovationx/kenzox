CREATE TABLE public.netlify_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  account_name TEXT,
  account_email TEXT,
  account_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.netlify_connections TO service_role;
ALTER TABLE public.netlify_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.netlify_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.netlify_oauth_states TO service_role;
ALTER TABLE public.netlify_oauth_states ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS netlify_site_id TEXT,
  ADD COLUMN IF NOT EXISTS netlify_site_name TEXT,
  ADD COLUMN IF NOT EXISTS netlify_url TEXT;

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