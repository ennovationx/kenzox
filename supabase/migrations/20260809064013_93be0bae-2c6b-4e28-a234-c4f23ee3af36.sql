DROP POLICY IF EXISTS "admins read all projects" ON public.projects;

CREATE TABLE IF NOT EXISTS public.ai_api_keys (
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

GRANT ALL ON public.ai_api_keys TO service_role;
ALTER TABLE public.ai_api_keys ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated grants or policies: keys are only reachable through
-- admin-verified server functions using the service role.

DROP TRIGGER IF EXISTS ai_api_keys_updated ON public.ai_api_keys;
CREATE TRIGGER ai_api_keys_updated BEFORE UPDATE ON public.ai_api_keys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();